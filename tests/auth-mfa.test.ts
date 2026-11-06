import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  set: vi.fn(),
  create: vi.fn(),
  session: vi.fn(),
  getClaims: vi.fn(),
  getUser: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  verifyOtp: vi.fn(),
  exchangeCodeForSession: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...mocks.cookies].map(([name, value]) => ({ name, value })),
    get: (name: string) =>
      mocks.cookies.has(name) ? { value: mocks.cookies.get(name) } : undefined,
    set: mocks.set,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.create,
}));
vi.mock("@/lib/auth/session.server", () => ({
  readSessionForClient: mocks.session,
}));
import { mfaPost } from "@/lib/auth/mfa-handlers.server";
import { POST as cancelPost } from "@/app/auth/mfa/cancel/route";
import { loadMfaOverview, privateQrDataUri } from "@/lib/auth/mfa.server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MfaOverview } from "@/features/auth/components/mfa-overview";
import {
  mfaCookie,
  makeMfaProof,
  readMfaProof,
} from "@/lib/auth/mfa-proof.server";
import { makeRecoveryProof } from "@/lib/auth/recovery.server";
import { authorizeOrganization } from "@/lib/authorization/access";
import type { SessionResult } from "@/lib/auth/resolve";

const secret = "test-only-not-a-deployment-secret".repeat(2);
const factor = "b145d1db-a336-4a89-bb07-b0b506663644";
const otherFactor = "f1d4ecbc-d7f2-4a7d-b74f-b1e7bd8ba745";
const challenge = "6ee50a5c-40e7-4b2e-bd7f-4bf82c1c7c47";
const base = "http://127.0.0.1:3000";
const binding = {
  sub: "user-a",
  session_id: "session-a",
  profile_id: "profile-a",
  organization_id: "org-a",
  factor_id: factor,
  challenge_id: challenge,
};
function candidate(): Extract<SessionResult, { status: "authenticated" }> {
  return {
    status: "authenticated",
    user: { id: "user-a" },
    identity: {
      authUserId: "user-a",
      profileId: "profile-a",
      status: "active",
      assuranceLevel: "aal1",
    },
    memberships: [
      {
        organizationId: "org-a",
        profileId: "profile-a",
        organizationStatus: "active",
        status: "active",
        role: "admin",
        slug: "qa",
        name: "QA",
      },
    ],
  };
}
function claims(aal = "aal1", sub = "user-a", sessionId = "session-a") {
  return {
    data: { claims: { sub, session_id: sessionId, aal, is_anonymous: false } },
    error: null,
  };
}
function factors(status: "verified" | "unverified" = "unverified") {
  return {
    data: { all: [{ id: factor, status, factor_type: "totp" }] },
    error: null,
  };
}
function request(
  action: "enroll" | "challenge" | "verify" | "cancel",
  fields: Record<string, string> = {},
  origin: string | null = base,
) {
  const headers = new Headers({
    "content-type": "application/x-www-form-urlencoded",
    "sec-fetch-site": "same-origin",
  });
  if (origin !== null) headers.set("origin", origin);
  return new Request(base + "/auth/mfa/" + action, {
    method: "POST",
    headers,
    body: new URLSearchParams(fields),
  });
}
function proof(overrides: Partial<typeof binding> = {}) {
  const value = makeMfaProof(
    { ...binding, ...overrides },
    secret,
    Math.floor(Date.now() / 1000) + 120,
  );
  mocks.cookies.set(mfaCookie, value);
  return value;
}
function verification() {
  return request("verify", {
    factor_id: factor,
    challenge_id: challenge,
    code: "123456",
  });
}
function promote(
  aal = "aal2",
  sub = "user-a",
  sessionId = "session-refreshed",
) {
  mocks.verify.mockImplementation(async () => {
    mocks.getClaims.mockResolvedValue(claims(aal, sub, sessionId));
    return { data: {}, error: null };
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.clear();
  for (const flag of [
    "AUTH_EMAIL_RECOVERY_ENABLED",
    "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
    "AUTH_INVITATION_ACCEPT_ENABLED",
  ])
    vi.stubEnv(flag, "false");
  vi.stubEnv("SUPABASE_AUTH_ENABLED", "true");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://rnxgrunnrdlgjsbsrjev.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_TEST_ONLY_NOT_A_REAL_KEY_123456",
  );
  vi.stubEnv("APP_ORIGIN", base);
  vi.stubEnv("AUTH_FLOW_SECRET", secret);
  mocks.session.mockResolvedValue(candidate());
  mocks.getClaims.mockResolvedValue(claims());
  mocks.getUser.mockResolvedValue({
    data: {
      user: {
        id: "user-a",
        email_confirmed_at: "2026-01-01",
        is_anonymous: false,
      },
    },
    error: null,
  });
  mocks.listFactors.mockResolvedValue(factors());
  mocks.enroll.mockResolvedValue({
    data: {
      id: factor,
      type: "totp",
      totp: {
        qr_code:
          'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>',
        secret: "SYNTHETIC-ONLY",
      },
    },
    error: null,
  });
  mocks.challenge.mockResolvedValue({
    data: {
      id: challenge,
      type: "totp",
      expires_at: Math.floor(Date.now() / 1000) + 120,
    },
    error: null,
  });
  mocks.verify.mockResolvedValue({ data: {}, error: null });
  mocks.unenroll.mockReset();
  mocks.unenroll.mockResolvedValue({ data: { id: factor }, error: null });
  mocks.set.mockImplementation(
    (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) mocks.cookies.delete(name);
      else mocks.cookies.set(name, value);
    },
  );
  mocks.create.mockResolvedValue({
    auth: {
      getClaims: mocks.getClaims,
      getUser: mocks.getUser,
      mfa: {
        listFactors: mocks.listFactors,
        enroll: mocks.enroll,
        unenroll: mocks.unenroll,
        challenge: mocks.challenge,
        verify: mocks.verify,
      },
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      verifyOtp: mocks.verifyOtp,
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("MFA: acceso de candidato y overview con SDK simulado", () => {
  it("sin configuración no inicializa el SDK", async () => {
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "false");
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
    expect(await loadMfaOverview()).toMatchObject({ status: "unconfigured" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("sin sesión no permite crear factores", async () => {
    mocks.session.mockResolvedValue({ status: "anonymous", user: null });
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(401);
    expect(await loadMfaOverview()).toMatchObject({ status: "anonymous" });
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("perfil o datos no disponibles no abren enrollment", async () => {
    mocks.session.mockResolvedValue({ status: "unavailable", user: null });
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it.each([
    "student",
    "missing-profile",
    "inactive-membership",
    "suspended-organization",
    "blocked-profile",
    "missing-membership",
  ] as const)("rechaza candidato %s sin operaciones MFA", async (kind) => {
    const session = candidate();
    if (kind === "student")
      session.memberships[0] = { ...session.memberships[0]!, role: "student" };
    if (kind === "missing-profile") session.identity = null;
    if (kind === "blocked-profile")
      session.identity = { ...session.identity!, status: "blocked" };
    if (kind === "missing-membership") session.memberships = [];
    if (kind === "inactive-membership")
      session.memberships[0] = {
        ...session.memberships[0]!,
        status: "suspended",
      };
    if (kind === "suspended-organization")
      session.memberships[0] = {
        ...session.memberships[0]!,
        organizationStatus: "suspended",
      };
    mocks.session.mockResolvedValue(session);
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(403);
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.challenge).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("Admin aal1 puede consultar factores sin mutación al abrir GET", async () => {
    const result = await loadMfaOverview();
    expect(result).toMatchObject({
      status: "ready",
      aal: "aal1",
      factors: [{ id: factor, status: "unverified" }],
    });
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.challenge).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("Admin aal2 sigue autorizado y no recibe enrollment automático", async () => {
    const session = candidate();
    session.identity = { ...session.identity!, assuranceLevel: "aal2" };
    mocks.session.mockResolvedValue(session);
    mocks.getClaims.mockResolvedValue(claims("aal2"));
    mocks.listFactors.mockResolvedValue(factors("verified"));
    expect(await loadMfaOverview()).toMatchObject({
      status: "ready",
      aal: "aal2",
    });
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("claims de otra identidad o sin session_id cierran el acceso", async () => {
    for (const value of [
      claims("aal1", "other-user"),
      { data: { claims: { sub: "user-a", aal: "aal1" } }, error: null },
      { data: null, error: Error("simulated invalid claims") },
    ]) {
      mocks.getClaims.mockResolvedValue(value);
      const response = await mfaPost(request("enroll"), "enroll");
      expect([401, 403]).toContain(response.status);
    }
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("error al listar factores no se interpreta como ausencia de factores", async () => {
    mocks.listFactors.mockResolvedValue({
      data: null,
      error: Error("private provider detail"),
    });
    const response = await mfaPost(request("enroll"), "enroll");
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await response.text()).not.toContain("private provider detail");
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
});

describe("MFA: controles de POST y protección de secreto", () => {
  it.each([
    null,
    "null",
    "https://evil.test",
    "http://localhost:3000",
    "http://127.0.0.1:3001",
  ])("Origin %s se rechaza antes del SDK", async (origin) => {
    const req = request("enroll", {}, origin);
    const response = await mfaPost(req, "enroll");
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(req.bodyUsed).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rechaza Fetch Metadata cross-site incluso con Origin exacto", async () => {
    const req = request("enroll");
    req.headers.set("sec-fetch-site", "cross-site");
    expect((await mfaPost(req, "enroll")).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("tipo de cuerpo no admitido no crea factor", async () => {
    const req = new Request(base + "/auth/mfa/enroll", {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: "{}",
    });
    expect((await mfaPost(req, "enroll")).status).toBe(400);
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("enrollment explícito muestra QR inline privado sin exponer secreto textual", async () => {
    mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    const response = await mfaPost(request("enroll"), "enroll");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("data:image/svg+xml;base64,");
    expect(html).toContain("/auth/mfa/challenge");
    expect(html).not.toContain("SYNTHETIC-ONLY");
    expect(html).not.toContain("<svg");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.create).toHaveBeenCalledWith(true);
    expect(mocks.enroll).toHaveBeenCalledTimes(1);
    expect(mocks.verify).not.toHaveBeenCalled();
    for (const value of mocks.cookies.values()) {
      expect(value).not.toContain("SYNTHETIC-ONLY");
      expect(value).not.toContain("data:image");
    }
  });
  it.each(["verified", "unverified"] as const)(
    "factor %s ya existente impide duplicar enrollment",
    async (status) => {
      mocks.listFactors.mockResolvedValue(factors(status));
      const response = await mfaPost(request("enroll"), "enroll");
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(
        base + "/auth/mfa?notice=exists",
      );
      expect(mocks.enroll).not.toHaveBeenCalled();
    },
  );
  it("QR con contenido activo o recursos externos no se inserta en HTML", async () => {
    mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    const malicious =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><image href="https://evil.test/x"/></svg>';
    mocks.enroll.mockResolvedValue({
      data: {
        id: factor,
        type: "totp",
        totp: {
          qr_code: "data:image/svg+xml;utf-8," + malicious,
          secret: "SYNTHETIC-ONLY",
        },
      },
      error: null,
    });
    const response = await mfaPost(request("enroll"), "enroll");
    const text = await response.text();
    expect(text).not.toContain("evil.test");
    expect(text).not.toContain("<script");
    expect(text).not.toContain("SYNTHETIC-ONLY");
    expect(response.status).toBeGreaterThanOrEqual(300);
  });
  it("tres controles de correo apagados no impiden MFA ni llaman a recuperación", async () => {
    const response = await mfaPost(
      request("challenge", { factor_id: factor }),
      "challenge",
    );
    expect(response.status).toBe(200);
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});

describe("MFA: challenge y verificación ligados al usuario/sesión", () => {
  it("challenge propio firma cookie privada y expone formulario local", async () => {
    const response = await mfaPost(
      request("challenge", { factor_id: factor }),
      "challenge",
    );
    expect(response.status).toBe(200);
    expect(mocks.challenge).toHaveBeenCalledWith({ factorId: factor });
    expect(response.headers.get("cache-control")).toContain("no-store");
    const html = await response.text();
    expect(html).toContain("/auth/mfa/verify");
    expect(html).toContain('name="code"');
    const value = mocks.cookies.get(mfaCookie);
    const parsed = readMfaProof(value, secret);
    expect(parsed).toMatchObject(binding);
    expect(parsed!.exp).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) + 120,
    );
    const write = mocks.set.mock.calls.find(
      ([name, , options]) => name === mfaCookie && options?.maxAge > 0,
    );
    expect(write?.[2]).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/auth/mfa",
      secure: false,
    });
  });
  it("cookie de challenge utiliza Secure con origen HTTPS", async () => {
    vi.stubEnv("APP_ORIGIN", "https://example.test");
    const req = new Request("https://example.test/auth/mfa/challenge", {
      method: "POST",
      headers: {
        origin: "https://example.test",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ factor_id: factor }),
    });
    expect((await mfaPost(req, "challenge")).status).toBe(200);
    expect(
      mocks.set.mock.calls.some(
        ([, , options]) => options?.httpOnly && options?.secure,
      ),
    ).toBe(true);
  });
  it("factor ajeno no se desafía ni verifica", async () => {
    const response = await mfaPost(
      request("challenge", { factor_id: otherFactor }),
      "challenge",
    );
    expect(response.status).toBe(403);
    expect(mocks.challenge).not.toHaveBeenCalled();
    proof({ factor_id: otherFactor });
    const verified = await mfaPost(
      request("verify", {
        factor_id: otherFactor,
        challenge_id: challenge,
        code: "123456",
      }),
      "verify",
    );
    expect(verified.status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("verify exitoso exige claims frescos aal2 y limpia prueba", async () => {
    proof();
    promote();
    const response = await mfaPost(verification(), "verify");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      base + "/seleccionar-organizacion",
    );
    expect(mocks.verify).toHaveBeenCalledWith({
      factorId: factor,
      challengeId: challenge,
      code: "123456",
    });
    expect(mocks.getUser).toHaveBeenCalled();
    expect(mocks.getClaims).toHaveBeenCalled();
    expect(mocks.cookies.has(mfaCookie)).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["invalid", "expired"])(
    "código %s mantiene acceso cerrado y no refleja detalles",
    async () => {
      proof();
      mocks.verify.mockResolvedValue({
        data: null,
        error: Error("provider-private-detail"),
      });
      const response = await mfaPost(verification(), "verify");
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toMatch(
        /\/auth\/mfa\?notice=(failed|expired|invalid)$/,
      );
      expect(await response.text()).not.toContain("provider-private-detail");
      expect(response.headers.get("location")).not.toContain("123456");
    },
  );
  it.each(["aal1", "other-user"] as const)(
    "respuesta verify sin promoción fiable (%s) no autoriza",
    async (kind) => {
      proof();
      promote(
        kind === "aal1" ? "aal1" : "aal2",
        kind === "other-user" ? "other-user" : "user-a",
      );
      const response = await mfaPost(verification(), "verify");
      expect(response.headers.get("location")).not.toBe(
        base + "/seleccionar-organizacion",
      );
      expect(response.status).toBeGreaterThanOrEqual(300);
    },
  );
  it("getUser inválido después de verify mantiene cerrado el acceso", async () => {
    proof();
    mocks.verify.mockImplementation(async () => {
      mocks.getClaims.mockResolvedValue(claims("aal2"));
      mocks.getUser.mockResolvedValue({
        data: { user: null },
        error: Error("invalid session"),
      });
      return { data: {}, error: null };
    });
    const response = await mfaPost(verification(), "verify");
    expect(response.headers.get("location")).not.toBe(
      base + "/seleccionar-organizacion",
    );
  });
  it.each(["sub", "session_id", "profile_id", "organization_id"] as const)(
    "prueba de otro %s no se consume",
    async (key) => {
      proof({ [key]: "other" });
      const response = await mfaPost(verification(), "verify");
      expect(response.status).toBe(403);
      expect(response.headers.get("location")).toBeNull();
      expect(mocks.verify).not.toHaveBeenCalled();
    },
  );
  it("challenge enviado distinto al firmado no se verifica", async () => {
    proof();
    const response = await mfaPost(
      request("verify", {
        factor_id: factor,
        challenge_id: otherFactor,
        code: "123456",
      }),
      "verify",
    );
    expect(response.status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("sin prueba, prueba manipulada o vencida no llama verify", async () => {
    const oldNow = Date.now() - 600000;
    const expired = makeMfaProof(
      binding,
      secret,
      Math.floor(oldNow / 1000) + 60,
      oldNow,
    );
    for (const value of [undefined, "malformed", expired]) {
      if (value) mocks.cookies.set(mfaCookie, value);
      else mocks.cookies.delete(mfaCookie);
      const response = await mfaPost(verification(), "verify");
      expect(response.status).toBe(303);
    }
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it.each(["", "abc123", "12345", "1234567"])(
    "código con formato no válido %s no llega al proveedor",
    async (code) => {
      proof();
      const response = await mfaPost(
        request("verify", { factor_id: factor, challenge_id: challenge, code }),
        "verify",
      );
      expect(response.status).toBe(303);
      expect(mocks.verify).not.toHaveBeenCalled();
    },
  );
});

describe("prueba MFA aislada y guard administrativo intacto", () => {
  it("prueba acota plazo al proveedor y a cinco minutos, sin incluir códigos o QR", () => {
    const now = 1000000;
    const token = makeMfaProof(
      binding,
      secret,
      Math.floor(now / 1000) + 1000,
      now,
    );
    const value = readMfaProof(token, secret, now);
    expect(value).toMatchObject({ ...binding, purpose: "mfa-totp" });
    expect(value!.exp).toBeLessThanOrEqual(now / 1000 + 300);
    expect(readMfaProof(token + "x", secret, now)).toBeNull();
    expect(readMfaProof(token, secret, now + 301000)).toBeNull();
  });
  it("ticket de recuperación no se acepta como prueba MFA", () => {
    const token = makeRecoveryProof(
      { sub: "user-a", session_id: "session-a", purpose: "recovery" },
      secret,
    );
    expect(readMfaProof(token, secret)).toBeNull();
  });
  it("Admin aal1 sigue denegado y alumno aal2 no se convierte en Admin", () => {
    const session = candidate();
    expect(
      authorizeOrganization(
        session.identity,
        session.memberships[0]!,
        "org-a",
        "admin",
      ),
    ).toEqual({ allowed: false, reason: "mfa_required" });
    session.identity = { ...session.identity!, assuranceLevel: "aal2" };
    session.memberships[0] = { ...session.memberships[0]!, role: "student" };
    expect(
      authorizeOrganization(
        session.identity,
        session.memberships[0]!,
        "org-a",
        "admin",
      ),
    ).toEqual({ allowed: false, reason: "admin_required" });
  });
});

describe("vista de seguridad y QR del titular", () => {
  it("vista aal1 sin factores solo ofrece enrollment mediante POST", () => {
    const html = renderToStaticMarkup(
      createElement(MfaOverview, { aal: "aal1", factors: [] }),
    );
    expect(html).toContain('action="/auth/mfa/enroll"');
    expect(html).toContain('method="post"');
    expect(html).not.toContain("data:image");
    expect(html).not.toContain('href="/auth/mfa/enroll"');
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("factor pendiente ofrece challenge y cancelación explícita sin mutar al renderizar", () => {
    const html = renderToStaticMarkup(
      createElement(MfaOverview, {
        aal: "aal1",
        factors: [{ id: factor, status: "unverified" }],
      }),
    );
    expect(html).toContain('action="/auth/mfa/challenge"');
    expect(html).toContain('name="factor_id"');
    expect(html).toContain("Configuración pendiente");
    expect(html).not.toContain('action="/auth/mfa/enroll"');
    expect(html).toContain('action="/auth/mfa/cancel"');
    expect(html).toContain("Cancelar configuración pendiente");
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it("notice verified no finge MFA cuando los claims del contexto siguen aal1", () => {
    const html = renderToStaticMarkup(
      createElement(MfaOverview, {
        aal: "aal1",
        factors: [],
        notice: "verified",
      }),
    );
    expect(html).toContain('data-assurance-level="aal1"');
    expect(html).not.toContain(
      "La verificación en dos pasos está completada para esta sesión.",
    );
    expect(html).not.toContain(
      "Tu sesión tiene la verificación en dos pasos completada.",
    );
  });
  it("vista aal2 refleja el contexto verificado y no parámetros arbitrarios", () => {
    const html = renderToStaticMarkup(
      createElement(MfaOverview, {
        aal: "aal2",
        factors: [{ id: factor, status: "verified" }],
        notice: "<script>provider-secret</script>",
      }),
    );
    expect(html).toContain('data-assurance-level="aal2"');
    expect(html).toContain(
      "Tu sesión tiene la verificación en dos pasos completada.",
    );
    expect(html).not.toContain("provider-secret");
  });
  it.each([
    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><p>secret</p></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.test/x"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path src="https://evil.test/x"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><path d="M0 0"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://evil.test/x)"/></svg>',
    '<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"></svg>',
  ])("QR con markup activo o referencia externa se rechaza", (svg) => {
    expect(privateQrDataUri("data:image/svg+xml;utf-8," + svg)).toBeNull();
  });
  it("QR válido del proveedor se representa como imagen base64, incluso URI codificado", () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    for (const body of [svg, encodeURIComponent(svg)]) {
      const result = privateQrDataUri("data:image/svg+xml;utf-8," + body);
      expect(result).toBe(
        "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
      );
    }
    expect(privateQrDataUri("https://evil.test/qr.svg")).toBeNull();
    expect(privateQrDataUri(undefined)).toBeNull();
  });
});

describe("MFA: estado y autorización se revalidan durante el flujo", () => {
  it("alumno aal2 no puede configurar TOTP mediante el handler", async () => {
    const session = candidate();
    session.identity = { ...session.identity!, assuranceLevel: "aal2" };
    session.memberships[0] = { ...session.memberships[0]!, role: "student" };
    mocks.session.mockResolvedValue(session);
    mocks.getClaims.mockResolvedValue(claims("aal2"));
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(403);
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("membresía revocada después del challenge impide consumir el código", async () => {
    proof();
    const session = candidate();
    session.memberships[0] = {
      ...session.memberships[0]!,
      status: "suspended",
    };
    mocks.session.mockResolvedValue(session);
    expect((await mfaPost(verification(), "verify")).status).toBe(403);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("challenge ya vencido según el proveedor no genera una prueba", async () => {
    mocks.challenge.mockResolvedValue({
      data: {
        id: challenge,
        type: "totp",
        expires_at: Math.floor(Date.now() / 1000) - 1,
      },
      error: null,
    });
    const response = await mfaPost(
      request("challenge", { factor_id: factor }),
      "challenge",
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toContain("/auth/mfa?notice=");
    expect(mocks.cookies.has(mfaCookie)).toBe(false);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("pérdida del rol durante verify no permite continuar aunque Auth emita aal2", async () => {
    proof();
    mocks.verify.mockImplementation(async () => {
      mocks.getClaims.mockResolvedValue(claims("aal2"));
      const session = candidate();
      session.memberships[0] = { ...session.memberships[0]!, role: "student" };
      mocks.session.mockResolvedValue(session);
      return { data: {}, error: null };
    });
    const response = await mfaPost(verification(), "verify");
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).not.toBe(
      base + "/seleccionar-organizacion",
    );
  });
});

describe("compatibilidad QR con SVGo de Supabase Auth", () => {
  // Matriz sintética: replica los rectángulos de goqrsvg/SVGo, sin datos TOTP.
  const denseSvg =
    '<?xml version="1.0"?>\n<!-- Generated by SVGo -->\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="195" height="195">' +
    Array.from({ length: 57 * 57 }, (_, index) => {
      const x = (index % 57) * 3 + 12;
      const y = Math.floor(index / 57) * 3 + 12;
      const fill = index % 2 ? "black" : "white";
      return (
        '<rect x="' +
        x +
        '" y="' +
        y +
        '" width="3" height="3" style="fill:' +
        fill +
        ';stroke:none"/>'
      );
    }).join("\n") +
    "</svg>";
  const prefix = "data:image/svg+xml;utf-8,";

  it.each([false, true])(
    "acepta SVG denso mayor de 150000 caracteres (URI codificada: %s)",
    async (encoded) => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("MFA_ENROLL_DIAGNOSTICS", "true");
      const qr = prefix + (encoded ? encodeURIComponent(denseSvg) : denseSvg);
      expect(qr.length).toBeGreaterThan(150000);
      const dataUri = privateQrDataUri(qr);
      // Las aserciones no imprimen la imagen sintética completa si fallan.
      expect(typeof dataUri).toBe("string");
      expect(dataUri?.startsWith("data:image/svg+xml;base64,")).toBe(true);
      mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
      mocks.enroll.mockResolvedValue({
        data: {
          id: factor,
          type: "totp",
          totp: { qr_code: qr, secret: "SYNTHETIC-ONLY" },
        },
        error: null,
      });
      const log = vi.spyOn(console, "info").mockImplementation(() => {});
      const response = await mfaPost(request("enroll"), "enroll");
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const html = await response.text();
      expect(html.includes(dataUri!)).toBe(true);
      expect(html.includes("<svg")).toBe(false);
      expect(html.includes("SYNTHETIC-ONLY")).toBe(false);
      expect(log).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls).includes(denseSvg)).toBe(false);
      expect(JSON.stringify(log.mock.calls).includes(qr)).toBe(false);
      expect(JSON.stringify(log.mock.calls).includes(dataUri!)).toBe(false);
      expect(JSON.stringify(log.mock.calls).includes("SYNTHETIC-ONLY")).toBe(
        false,
      );
      expect(JSON.stringify(mocks.set.mock.calls).includes(dataUri!)).toBe(
        false,
      );
      expect(mocks.unenroll).not.toHaveBeenCalled();
    },
  );

  it("conserva el límite finito de 1 Mi caracteres antes de procesar el SVG", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const atLimit =
      prefix + svg + " ".repeat(1024 * 1024 - prefix.length - svg.length);
    expect(privateQrDataUri(atLimit) !== null).toBe(true);
    const rejected = vi.fn();
    expect(privateQrDataUri(atLimit + " ", rejected)).toBeNull();
    expect(rejected).toHaveBeenCalledExactlyOnceWith("qr_invalid_type_or_size");
  });

  it.each([null, undefined, {}, [], 123])(
    "rechaza tipos ajenos al contrato: %s",
    (value) => {
      expect(privateQrDataUri(value)).toBeNull();
    },
  );

  it.each([
    "<script>alert(1)</script>",
    "<foreignObject><div>HTML</div></foreignObject>",
    '<image href="https://evil.test/x"/>',
    '<path onload="alert(1)"/>',
    '<rect style="fill:url(https://evil.test/x)"/>',
    '<g xmlns="https://evil.test/"/>',
    '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>',
  ])("rechaza contenido activo o externo también en SVG denso", (markup) => {
    const qr = prefix + denseSvg.replace("</svg>", markup + "</svg>");
    expect(qr.length).toBeGreaterThan(150000);
    expect(privateQrDataUri(qr)).toBeNull();
    expect(
      privateQrDataUri(prefix + encodeURIComponent(qr.slice(prefix.length))),
    ).toBeNull();
  });

  it("normaliza el SVG del proveedor y completa enrollment sin markup activo", async () => {
    const svg =
      '<?xml version="1.0"?>\n<!-- Generated by SVGo -->\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100"><rect x="0" y="0" width="3" height="3" style="fill:black;stroke:none"/><rect x="3" y="0" width="3" height="3" style="fill:white;stroke:none"/></svg>';
    const dataUri = privateQrDataUri("data:image/svg+xml;utf-8," + svg);
    expect(dataUri).toMatch(/^data:image\/svg\+xml;base64,/);
    const normalized = Buffer.from(dataUri!.split(",")[1]!, "base64").toString(
      "utf8",
    );
    expect(normalized).toContain('fill="black" stroke="none"');
    expect(normalized).toContain('fill="white" stroke="none"');
    expect(normalized).not.toContain("<?xml");
    expect(normalized).not.toContain("<!--");
    expect(normalized).not.toContain("xmlns:xlink");
    expect(normalized).not.toContain("style=");
    mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
    mocks.enroll.mockResolvedValue({
      data: {
        id: factor,
        type: "totp",
        totp: {
          qr_code: "data:image/svg+xml;utf-8," + svg,
          secret: "SYNTHETIC-ONLY",
        },
      },
      error: null,
    });
    const response = await mfaPost(request("enroll"), "enroll");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(dataUri);
    expect(html).not.toContain("<?xml");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("SYNTHETIC-ONLY");
  });
  it.each([
    '<?xml version="1.1"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<?xml version="1.0"?>\n<!-- Unrecognized generator -->\n<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<?xml version="1.0"?>\n<!-- Generated by SVGo -->\n<!DOCTYPE svg><svg xmlns="http://www.w3.org/2000/svg"></svg>',
    '<?xml version="1.0"?>\n<!-- Generated by SVGo -->\n<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://evil.test/x);stroke:none"/></svg>',
  ])(
    "cabeceras, DTD o estilos fuera del contrato seguro se rechazan",
    (svg) => {
      expect(privateQrDataUri("data:image/svg+xml;utf-8," + svg)).toBeNull();
    },
  );
});

describe("MFA: cancelación explícita de TOTP pendiente", () => {
  it("cancela en aal1, borra el challenge y permite un enrollment nuevo privado", async () => {
    proof();
    mocks.unenroll.mockImplementation(async () => {
      mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
      return { data: { id: factor }, error: null };
    });
    const response = await cancelPost(request("cancel", { factor_id: factor }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(base + "/auth/mfa");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.unenroll).toHaveBeenCalledExactlyOnceWith({
      factorId: factor,
    });
    expect(mocks.listFactors).toHaveBeenCalledTimes(1);
    expect(mocks.cookies.has(mfaCookie)).toBe(false);
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    const stale = await mfaPost(verification(), "verify");
    expect(stale.headers.get("location")).toBe(
      base + "/auth/mfa?notice=expired",
    );
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(await loadMfaOverview()).toMatchObject({
      status: "ready",
      factors: [],
    });
    const enrollment = await mocks.enroll.getMockImplementation()!();
    mocks.enroll.mockResolvedValue({
      ...enrollment,
      data: { ...enrollment.data, id: otherFactor },
    });
    mocks.enroll.mockClear();
    const fresh = await mfaPost(request("enroll"), "enroll");
    const html = await fresh.text();
    expect(fresh.status).toBe(200);
    expect(html).toContain("data:image/svg+xml;base64,");
    expect(html).toContain(otherFactor);
    expect(html).not.toContain("SYNTHETIC-ONLY");
    expect(fresh.headers.get("cache-control")).toContain("no-store");
    expect(mocks.enroll).toHaveBeenCalledTimes(1);
    expect([...mocks.cookies.values()].join()).not.toMatch(
      /SYNTHETIC-ONLY|data:image/,
    );
  });
  it("elimina solo el seleccionado aunque exista otro TOTP verificado", async () => {
    mocks.listFactors.mockResolvedValue({
      data: {
        all: [
          { id: factor, status: "unverified", factor_type: "totp" },
          { id: otherFactor, status: "verified", factor_type: "totp" },
        ],
      },
      error: null,
    });
    expect(
      (await mfaPost(request("cancel", { factor_id: factor }), "cancel"))
        .status,
    ).toBe(303);
    expect(mocks.unenroll).toHaveBeenCalledExactlyOnceWith({
      factorId: factor,
    });
  });
  it("rechaza el factor que pasó a verified después de renderizar la página", async () => {
    expect(await loadMfaOverview()).toMatchObject({
      factors: [{ id: factor, status: "unverified" }],
    });
    mocks.listFactors.mockResolvedValue(factors("verified"));
    expect(
      (await mfaPost(request("cancel", { factor_id: factor }), "cancel"))
        .status,
    ).toBe(403);
    expect(mocks.listFactors).toHaveBeenCalledTimes(2);
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it.each(["ajeno", "eliminado", "phone"])(
    "rechaza factor %s sin unenroll",
    async (kind) => {
      if (kind === "eliminado")
        mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
      if (kind === "phone")
        mocks.listFactors.mockResolvedValue({
          data: {
            all: [{ id: factor, status: "unverified", factor_type: "phone" }],
          },
          error: null,
        });
      const response = await mfaPost(
        request("cancel", {
          factor_id: kind === "ajeno" ? otherFactor : factor,
        }),
        "cancel",
      );
      expect(response.status).toBe(403);
      expect(mocks.unenroll).not.toHaveBeenCalled();
    },
  );
  it.each([null, "https://evil.test", "http://localhost:3000"])(
    "rechaza Origin %s antes del SDK",
    async (origin) => {
      const response = await mfaPost(
        request("cancel", { factor_id: factor }, origin),
        "cancel",
      );
      expect(response.status).toBe(403);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.unenroll).not.toHaveBeenCalled();
    },
  );
  it("rechaza Fetch Metadata cross-site y métodos distintos de POST", async () => {
    const crossSite = request("cancel", { factor_id: factor });
    crossSite.headers.set("sec-fetch-site", "cross-site");
    expect((await mfaPost(crossSite, "cancel")).status).toBe(403);
    expect(
      (
        await mfaPost(
          new Request(base + "/auth/mfa/cancel", { headers: { origin: base } }),
          "cancel",
        )
      ).status,
    ).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([{}, { factor_id: "not-a-uuid" }])(
    "rechaza identificador inválido antes del SDK",
    async (fields) => {
      expect((await mfaPost(request("cancel", fields), "cancel")).status).toBe(
        303,
      );
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.unenroll).not.toHaveBeenCalled();
    },
  );
  it("rechaza identificadores duplicados en el formulario", async () => {
    const req = new Request(base + "/auth/mfa/cancel", {
      method: "POST",
      headers: {
        origin: base,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams([
        ["factor_id", factor],
        ["factor_id", otherFactor],
      ]),
    });
    expect((await mfaPost(req, "cancel")).status).toBe(303);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rechaza JSON y cuerpos demasiado grandes antes del SDK", async () => {
    for (const [contentType, body] of [
      ["application/json", "{}"],
      ["application/x-www-form-urlencoded", "factor_id=" + "a".repeat(8200)],
    ] as const) {
      const response = await mfaPost(
        new Request(base + "/auth/mfa/cancel", {
          method: "POST",
          headers: { origin: base, "content-type": contentType },
          body,
        }),
        "cancel",
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("Auth apagado no inicializa el SDK", async () => {
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "false");
    expect(
      (await mfaPost(request("cancel", { factor_id: factor }), "cancel"))
        .status,
    ).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("sesión ausente impide enumerar o eliminar factores", async () => {
    mocks.session.mockResolvedValue({ status: "anonymous" });
    expect(
      (await mfaPost(request("cancel", { factor_id: factor }), "cancel"))
        .status,
    ).toBe(401);
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it.each([
    "student",
    "perfil_bloqueado",
    "sin_perfil",
    "membresia_suspendida",
    "organizacion_suspendida",
  ])("deniega %s sin unenroll", async (kind) => {
    const session = candidate();
    if (kind === "student")
      session.memberships[0] = { ...session.memberships[0]!, role: "student" };
    if (kind === "perfil_bloqueado")
      session.identity = { ...session.identity!, status: "blocked" };
    if (kind === "sin_perfil") session.identity = null;
    if (kind === "membresia_suspendida")
      session.memberships[0] = {
        ...session.memberships[0]!,
        status: "suspended",
      };
    if (kind === "organizacion_suspendida")
      session.memberships[0] = {
        ...session.memberships[0]!,
        organizationStatus: "suspended",
      };
    mocks.session.mockResolvedValue(session);
    expect(
      (await mfaPost(request("cancel", { factor_id: factor }), "cancel"))
        .status,
    ).toBe(403);
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it("claims inválidos impiden cancelar", async () => {
    mocks.getClaims.mockResolvedValue(claims("aal1", "other-user"));
    expect(
      (await mfaPost(request("cancel", { factor_id: factor }), "cancel"))
        .status,
    ).toBe(401);
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it("un fallo de listFactors no se interpreta como autorización", async () => {
    mocks.listFactors.mockResolvedValue({
      data: null,
      error: Error("PRIVATE_PROVIDER_DETAIL"),
    });
    const response = await mfaPost(
      request("cancel", { factor_id: factor }),
      "cancel",
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("PRIVATE_PROVIDER_DETAIL");
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it("un status enviado por el formulario no permite borrar un verified", async () => {
    mocks.listFactors.mockResolvedValue(factors("verified"));
    expect(
      (
        await mfaPost(
          request("cancel", { factor_id: factor, status: "unverified" }),
          "cancel",
        )
      ).status,
    ).toBe(403);
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
  it.each(["error", "throw", "id_incorrecto", "sin_datos"])(
    "fallo de proveedor %s no crea un factor ni filtra detalles",
    async (kind) => {
      proof();
      if (kind === "error")
        mocks.unenroll.mockResolvedValue({
          data: null,
          error: Error("PRIVATE_PROVIDER_DETAIL"),
        });
      if (kind === "throw")
        mocks.unenroll.mockRejectedValue(Error("PRIVATE_PROVIDER_DETAIL"));
      if (kind === "id_incorrecto")
        mocks.unenroll.mockResolvedValue({
          data: { id: otherFactor },
          error: null,
        });
      if (kind === "sin_datos")
        mocks.unenroll.mockResolvedValue({ data: null, error: null });
      const response = await mfaPost(
        request("cancel", { factor_id: factor }),
        "cancel",
      );
      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.text()).not.toContain("PRIVATE_PROVIDER_DETAIL");
      expect(mocks.cookies.has(mfaCookie)).toBe(false);
      expect(mocks.unenroll).toHaveBeenCalledTimes(1);
      expect(mocks.enroll).not.toHaveBeenCalled();
      expect(mocks.challenge).not.toHaveBeenCalled();
      expect(mocks.verify).not.toHaveBeenCalled();
    },
  );
  it("UI ofrece cancelación solo para pendientes y no muestra QR de verified", () => {
    const html = renderToStaticMarkup(
      createElement(MfaOverview, {
        aal: "aal2",
        factors: [{ id: factor, status: "verified" }],
      }),
    );
    expect(html).not.toContain("/auth/mfa/cancel");
    expect(html).not.toContain("Cancelar configuración pendiente");
    expect(html).not.toContain("data:image");
    expect(html).toContain("/auth/mfa/challenge");
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });
});

describe("MFA enroll: etapas locales sanitizadas", () => {
  let log: ReturnType<typeof vi.spyOn>;
  const records = (): Record<string, unknown>[] =>
    (log.mock.calls as unknown[][]).map(([entry]) =>
      JSON.parse(String(entry).replace("[mfa-enroll] ", "")),
    );
  const lastFailure = () =>
    records()
      .filter((r) => r.event === "failed")
      .at(-1);
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MFA_ENROLL_DIAGNOSTICS", "true");
    log = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
  });
  afterEach(() => log.mockRestore());
  it("configuración y CSRF fallan antes de cualquier operación del proveedor", async () => {
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "false");
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
    expect(lastFailure()).toMatchObject({
      stage: "configuration",
      code: "configuration_unavailable",
      enroll_state: "not_called",
    });
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "true");
    expect(
      (await mfaPost(request("enroll", {}, "https://evil.test"), "enroll"))
        .status,
    ).toBe(403);
    expect(lastFailure()).toMatchObject({
      stage: "csrf",
      code: "csrf_rejected",
      enroll_state: "not_called",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rechazo del formulario queda diferenciado de Auth", async () => {
    const req = new Request(base + "/auth/mfa/enroll", {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: "{}",
    });
    expect((await mfaPost(req, "enroll")).status).toBe(400);
    expect(lastFailure()).toMatchObject({
      stage: "form",
      code: "invalid_form",
      enroll_state: "not_called",
    });
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it.each(["session", "authorization", "claims"])(
    "distingue %s antes del enrollment",
    async (stage) => {
      if (stage === "session")
        mocks.session.mockResolvedValue({ status: "anonymous", user: null });
      if (stage === "authorization") {
        const s = candidate();
        s.memberships[0] = { ...s.memberships[0]!, role: "student" };
        mocks.session.mockResolvedValue(s);
      }
      if (stage === "claims")
        mocks.getClaims.mockResolvedValue(claims("aal1", "other-user"));
      expect(
        (await mfaPost(request("enroll"), "enroll")).status,
      ).toBeGreaterThanOrEqual(400);
      expect(lastFailure()).toMatchObject({
        stage,
        enroll_state: "not_called",
      });
      expect(mocks.enroll).not.toHaveBeenCalled();
    },
  );
  it("preserva código saneado del listado aunque el helper arroje un error genérico", async () => {
    mocks.listFactors.mockResolvedValue({
      data: null,
      error: {
        code: "session_expired",
        status: 401,
        message: "PRIVATE_PROVIDER_MESSAGE",
      },
    });
    const response = await mfaPost(request("enroll"), "enroll");
    expect(response.status).toBe(503);
    expect(lastFailure()).toMatchObject({
      stage: "list_factors",
      code: "factor_list_failed",
      provider_code: "session_expired",
      enroll_state: "not_called",
    });
    expect(records().filter((r) => r.event === "failed")).toHaveLength(1);
    expect(JSON.stringify(records())).not.toContain("PRIVATE_PROVIDER_MESSAGE");
  });
  it("un factor existente termina sin llamar a enroll ni revelar su id", async () => {
    mocks.listFactors.mockResolvedValue(factors());
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(303);
    expect(records().at(-1)).toMatchObject({
      stage: "list_factors",
      event: "stop",
      code: "existing_factor",
      enroll_state: "not_called",
    });
    expect(JSON.stringify(records())).not.toContain(factor);
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
  it("distingue error devuelto por el SDK de una excepción durante la llamada", async () => {
    mocks.enroll.mockResolvedValueOnce({
      data: null,
      error: {
        code: "mfa_totp_enroll_not_enabled",
        status: 403,
        message: "PRIVATE_PROVIDER_MESSAGE",
      },
    });
    const response = await mfaPost(request("enroll"), "enroll");
    expect(response.status).toBe(503);
    expect(lastFailure()).toMatchObject({
      stage: "enroll_response",
      code: "provider_error",
      provider_code: "mfa_totp_enroll_not_enabled",
      enroll_state: "returned",
    });
    expect(await response.text()).not.toContain("mfa_totp_enroll_not_enabled");
    mocks.enroll.mockRejectedValueOnce(new TypeError("PRIVATE_NETWORK_DETAIL"));
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
    expect(lastFailure()).toMatchObject({
      stage: "auth_enroll",
      code: "unexpected_exception",
      exception: "type_error",
      enroll_state: "calling",
    });
    expect(JSON.stringify(records())).not.toMatch(
      /PRIVATE_PROVIDER_MESSAGE|PRIVATE_NETWORK_DETAIL/,
    );
  });
  it("detecta respuesta inválida después de que enroll retorna", async () => {
    mocks.enroll.mockResolvedValueOnce({
      data: { id: factor, type: "phone" },
      error: null,
    });
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
    expect(lastFailure()).toMatchObject({
      stage: "enroll_response",
      code: "invalid_enroll_response",
      enroll_state: "returned",
    });
  });
  it("ubica la ausencia del objeto totp en qr_receive sin filtrar el resultado", async () => {
    mocks.enroll.mockResolvedValueOnce({
      data: { id: factor, type: "totp", secret: "PRIVATE_RESPONSE_SECRET" },
      error: null,
    });
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
    expect(lastFailure()).toMatchObject({
      stage: "qr_receive",
      exception: "type_error",
      enroll_state: "returned",
    });
    expect(JSON.stringify(records())).not.toContain("PRIVATE_RESPONSE_SECRET");
  });
  it("QR rechazado informa motivo y no elimina ni reintenta el factor creado", async () => {
    mocks.enroll.mockResolvedValueOnce({
      data: {
        id: factor,
        type: "totp",
        totp: {
          qr_code:
            'data:image/svg+xml;utf-8,<svg onload="PRIVATE_QR_MARKER"></svg>',
          secret: "PRIVATE_SEED_MARKER",
        },
      },
      error: null,
    });
    const response = await mfaPost(request("enroll"), "enroll");
    expect(response.status).toBe(503);
    expect(lastFailure()).toMatchObject({
      stage: "qr_validation",
      code: "qr_blocked_markup",
      enroll_state: "returned",
    });
    expect(mocks.enroll).toHaveBeenCalledTimes(1);
    expect(mocks.unenroll).not.toHaveBeenCalled();
    expect(JSON.stringify(records())).not.toMatch(
      /PRIVATE_QR_MARKER|PRIVATE_SEED_MARKER|data:image|b145d1db/,
    );
  });
  it("enrollment exitoso llega hasta respuesta HTTP sin registrar QR, semilla o identidad", async () => {
    const response = await mfaPost(request("enroll"), "enroll");
    expect(response.status).toBe(200);
    expect(records().at(-1)).toMatchObject({
      stage: "http_response",
      event: "ok",
      enroll_state: "returned",
    });
    expect(new Set(records().map((r) => r.attempt)).size).toBe(1);
    const output = JSON.stringify(records());
    for (const text of [
      secret,
      "SYNTHETIC-ONLY",
      "data:image",
      factor,
      binding.sub,
      binding.session_id,
      binding.profile_id,
      binding.organization_id,
    ])
      expect(output).not.toContain(text);
    expect(await response.text()).toContain("data:image/svg+xml;base64,");
  });
  it("fallo del logger no impide la respuesta normal de enrollment", async () => {
    log.mockImplementation(() => {
      throw Error("PRIVATE_LOGGER_DETAIL");
    });
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(200);
  });
  it("challenge, verify y cancel no activan estas trazas", async () => {
    mocks.listFactors.mockResolvedValue(factors());
    await mfaPost(request("challenge", { factor_id: factor }), "challenge");
    await mfaPost(request("cancel", { factor_id: factor }), "cancel");
    await mfaPost(verification(), "verify");
    expect(log).not.toHaveBeenCalled();
  });
});

describe("MFA enroll: límites de llamada y respuesta", () => {
  let log: ReturnType<typeof vi.spyOn>;
  const failure = (): Record<string, unknown> | undefined =>
    (log.mock.calls as unknown[][])
      .map(
        ([entry]) =>
          JSON.parse(String(entry).replace("[mfa-enroll] ", "")) as Record<
            string,
            unknown
          >,
      )
      .filter((record) => record.event === "failed")
      .at(-1);
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MFA_ENROLL_DIAGNOSTICS", "true");
    log = vi.spyOn(console, "info").mockImplementation(() => {});
    mocks.listFactors.mockResolvedValue({ data: { all: [] }, error: null });
  });
  afterEach(() => log.mockRestore());
  it("error al crear el cliente ocurre antes de enroll", async () => {
    mocks.create.mockRejectedValueOnce(Error("PRIVATE_CLIENT_DETAIL"));
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
    expect(failure()).toMatchObject({
      stage: "client",
      code: "unexpected_exception",
      enroll_state: "not_called",
    });
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "PRIVATE_CLIENT_DETAIL",
    );
  });
  it("error al limpiar el challenge no se confunde con un factor creado", async () => {
    mocks.set.mockImplementationOnce(() => {
      throw Error("PRIVATE_COOKIE_DETAIL");
    });
    expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
    expect(failure()).toMatchObject({
      stage: "challenge_state_clear",
      enroll_state: "not_called",
    });
    expect(mocks.enroll).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "PRIVATE_COOKIE_DETAIL",
    );
  });
  it("error de HTML se identifica después de recibir y validar el QR", async () => {
    const module = await import("@/lib/auth/mfa-html");
    const render = vi.spyOn(module, "enrollmentHtml").mockImplementation(() => {
      throw Error("PRIVATE_HTML_DETAIL");
    });
    try {
      expect((await mfaPost(request("enroll"), "enroll")).status).toBe(503);
      expect(failure()).toMatchObject({
        stage: "html_render",
        code: "unexpected_exception",
        enroll_state: "returned",
      });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /PRIVATE_HTML_DETAIL|SYNTHETIC-ONLY|data:image/,
      );
      expect(mocks.unenroll).not.toHaveBeenCalled();
    } finally {
      render.mockRestore();
    }
  });
});

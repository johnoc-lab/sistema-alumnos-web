import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createHmac } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  jar: vi.fn(),
  proof: undefined as string | undefined,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.create,
}));
vi.mock("next/headers", () => ({ cookies: mocks.jar }));
import {
  authFeatures,
  credentialPurposeEnabled,
} from "@/lib/auth/features.server";
import {
  makeRecoveryProof,
  validRecoveryProof,
  readRecoveryProof,
} from "@/lib/auth/recovery.server";
import { AuthForm } from "@/features/auth/components/auth-form";
import RecoverPage from "@/app/auth/recuperar/page";
import ConfirmPage from "@/app/auth/confirm/page";
import PasswordPage from "@/app/auth/actualizar-password/page";
const secret = "test-only-not-a-real-deployment-secret".repeat(2);
const flags = [
  "AUTH_EMAIL_RECOVERY_ENABLED",
  "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
  "AUTH_INVITATION_ACCEPT_ENABLED",
];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.proof = undefined;
  mocks.jar.mockResolvedValue({ get: () => ({ value: mocks.proof }) });
  mocks.create.mockRejectedValue(Error("No debe contactar Auth"));
  vi.stubEnv("SUPABASE_AUTH_ENABLED", "true");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://rnxgrunnrdlgjsbsrjev.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_TEST_ONLY_NOT_A_REAL_KEY_123456",
  );
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("AUTH_FLOW_SECRET", secret);
  flags.forEach((name) => vi.stubEnv(name, "false"));
});
afterEach(() => vi.unstubAllEnvs());
describe("flags privados y UI con login preparado sin SMTP", () => {
  it("valores ausentes permanecen false", () => {
    flags.forEach((name) => vi.stubEnv(name, undefined));
    expect(authFeatures()).toEqual({
      emailRecovery: false,
      tokenHashRecovery: false,
      invitationAccept: false,
    });
  });
  it.each(["TRUE", "1", "yes", " true ", ""])(
    "no habilita con el valor %j",
    (value) => {
      flags.forEach((name) => vi.stubEnv(name, value));
      expect(Object.values(authFeatures())).toEqual([false, false, false]);
    },
  );
  it("cada control habilita solo su propósito", () => {
    vi.stubEnv("AUTH_EMAIL_RECOVERY_ENABLED", "true");
    expect(authFeatures()).toEqual({
      emailRecovery: true,
      tokenHashRecovery: false,
      invitationAccept: false,
    });
    expect(credentialPurposeEnabled("recovery", authFeatures())).toBe(false);
    vi.stubEnv("AUTH_TOKEN_HASH_RECOVERY_ENABLED", "true");
    expect(credentialPurposeEnabled("recovery", authFeatures())).toBe(true);
    expect(credentialPurposeEnabled("invite", authFeatures())).toBe(false);
  });
  it("login renderiza formulario habilitado sin ofrecer recuperación", () => {
    const html = renderToStaticMarkup(createElement(AuthForm));
    expect(html).toContain('action="/auth/login"');
    expect(html).toContain("Iniciar sesión");
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("/auth/recuperar");
  });
  it("email true muestra su enlace, sin habilitar token_hash/invite", () => {
    vi.stubEnv("AUTH_EMAIL_RECOVERY_ENABLED", "true");
    expect(renderToStaticMarkup(createElement(AuthForm))).toContain(
      "/auth/recuperar",
    );
    expect(authFeatures().tokenHashRecovery).toBe(false);
  });
  it("el control global sigue cerrando login", () => {
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "false");
    expect(renderToStaticMarkup(createElement(AuthForm))).toContain("disabled");
    expect(renderToStaticMarkup(createElement(AuthForm))).toContain(
      "Ingreso no habilitado",
    );
  });
  it("componentes de formularios apagados no aparecen ni montados directamente", () => {
    expect(
      renderToStaticMarkup(createElement(AuthForm, { mode: "recover" })),
    ).toBe("");
    expect(
      renderToStaticMarkup(createElement(AuthForm, { mode: "password" })),
    ).toBe("");
  });
  it("GET de recuperación directo no muestra formulario ni consulta Auth", async () => {
    const html = renderToStaticMarkup(
      await RecoverPage({ searchParams: Promise.resolve({ notice: "sent" }) }),
    );
    expect(html).not.toContain("<form");
    expect(html).not.toContain('name="email"');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.jar).not.toHaveBeenCalled();
  });
  it.each(["recovery", "invite"])(
    "GET confirm %s desactivado no refleja el token",
    async (type) => {
      const token = "UNCONSUMED_TEST_TOKEN_".repeat(2);
      const html = renderToStaticMarkup(
        await ConfirmPage({
          searchParams: Promise.resolve({ type, token_hash: token }),
        }),
      );
      expect(html).not.toContain("<form");
      expect(html).not.toContain(token);
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("GET de password apagado no lee cookie ni consulta Auth", async () => {
    const html = renderToStaticMarkup(
      await PasswordPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).not.toContain("<form");
    expect(mocks.jar).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("GET confirm comprueba el propósito en configuraciones mixtas", async () => {
    vi.stubEnv("AUTH_TOKEN_HASH_RECOVERY_ENABLED", "true");
    const html = renderToStaticMarkup(
      await ConfirmPage({
        searchParams: Promise.resolve({
          type: "invite",
          token_hash: "a".repeat(64),
        }),
      }),
    );
    expect(html).not.toContain("<form");
    const allowed = renderToStaticMarkup(
      await ConfirmPage({
        searchParams: Promise.resolve({
          type: "recovery",
          token_hash: "a".repeat(64),
        }),
      }),
    );
    expect(allowed).toContain('action="/auth/verify"');
  });
  it("GET password con prueba invite válida pero desactivada no consulta Auth", async () => {
    vi.stubEnv("AUTH_TOKEN_HASH_RECOVERY_ENABLED", "true");
    mocks.proof = makeRecoveryProof(
      { sub: "user-a", session_id: "session-a", purpose: "invite" },
      secret,
    );
    const html = renderToStaticMarkup(
      await PasswordPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).not.toContain("<form");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
describe("pruebas de propósito en tickets firmados", () => {
  it("el propósito está firmado y no se puede cambiar a otra función", () => {
    const proof = makeRecoveryProof(
      { sub: "a", session_id: "s", purpose: "invite" },
      secret,
    );
    expect(readRecoveryProof(proof, secret)?.purpose).toBe("invite");
    const [body, signature] = proof.split(".");
    const payload = JSON.parse(
      Buffer.from(body!, "base64url").toString("utf8"),
    );
    payload.purpose = "recovery";
    const changed =
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      "." +
      signature;
    expect(
      validRecoveryProof(changed, { sub: "a", session_id: "s" }, secret),
    ).toBe(false);
  });
  it("los tickets antiguos sin propósito se rechazan aun con firma válida", () => {
    const body = Buffer.from(
      JSON.stringify({
        sub: "a",
        session_id: "s",
        exp: Math.floor(Date.now() / 1000) + 600,
      }),
    ).toString("base64url");
    const proof =
      body +
      "." +
      createHmac("sha256", secret).update(body).digest("base64url");
    expect(readRecoveryProof(proof, secret)).toBeNull();
  });
});

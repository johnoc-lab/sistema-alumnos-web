import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CookieOptions } from "@supabase/ssr";
vi.mock("server-only", () => ({}));
type Adapter = {
  setAll(
    values: { name: string; value: string; options: CookieOptions }[],
  ): void;
};
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  set: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
  listFactors: vi.fn(),
  enroll: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  options: undefined as Adapter | undefined,
  cookies: new Map<string, string>(),
  aal: "aal1",
  role: "admin",
  profileStatus: "active",
  revoked: false,
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...mocks.cookies].map(([name, value]) => ({ name, value })),
    get: (name: string) =>
      mocks.cookies.has(name) ? { value: mocks.cookies.get(name) } : undefined,
    set: mocks.set,
  }),
}));
import { mfaPost } from "@/lib/auth/mfa-handlers.server";
import { makeMfaProof, mfaCookie } from "@/lib/auth/mfa-proof.server";
const factor = "11111111-2222-3333-4444-555555555555";
const challenge = "66666666-7777-8888-9999-aaaaaaaaaaaa";
const secret = "TEST_ONLY_NOT_A_DEPLOYMENT_MFA_SECRET".repeat(2);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.clear();
  mocks.aal = "aal1";
  mocks.role = "admin";
  mocks.profileStatus = "active";
  mocks.revoked = false;
  vi.stubEnv("SUPABASE_AUTH_ENABLED", "true");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://rnxgrunnrdlgjsbsrjev.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_TEST_ONLY_NOT_A_REAL_KEY_123456",
  );
  vi.stubEnv("APP_ORIGIN", "http://127.0.0.1:3000");
  vi.stubEnv("AUTH_FLOW_SECRET", secret);
  for (const f of [
    "AUTH_EMAIL_RECOVERY_ENABLED",
    "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
    "AUTH_INVITATION_ACCEPT_ENABLED",
  ])
    vi.stubEnv(f, "false");
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
  mocks.getClaims.mockImplementation(async () => ({
    data: {
      claims: {
        sub: "user-a",
        session_id: mocks.aal === "aal2" ? "renewed-session" : "session-a",
        aal: mocks.aal,
      },
    },
    error: null,
  }));
  mocks.listFactors.mockResolvedValue({
    data: { all: [{ id: factor, status: "verified", factor_type: "totp" }] },
    error: null,
  });
  mocks.set.mockImplementation((name: string, value: string) =>
    mocks.cookies.set(name, value),
  );
  mocks.verify.mockImplementation(async () => {
    mocks.aal = "aal2";
    if (mocks.revoked) mocks.profileStatus = "blocked";
    mocks.options!.setAll([
      {
        name: "sb-mfa-mock",
        value: "test-session-cookie",
        options: { path: "/", sameSite: "lax" },
      },
    ]);
    return { data: {}, error: null };
  });
  mocks.create.mockImplementation((_url, _key, options) => {
    mocks.options = options.cookies;
    return {
      auth: {
        getUser: mocks.getUser,
        getClaims: mocks.getClaims,
        mfa: {
          listFactors: mocks.listFactors,
          enroll: mocks.enroll,
          challenge: mocks.challenge,
          verify: mocks.verify,
        },
      },
      from: (table: string) => {
        const data =
          table === "profiles"
            ? { id: "profile-a", status: mocks.profileStatus }
            : table === "organization_memberships"
              ? [
                  {
                    profile_id: "profile-a",
                    organization_id: "org-a",
                    role: mocks.role,
                    status: "active",
                  },
                ]
              : [{ id: "org-a", slug: "qa", name: "QA", status: "active" }];
        const result = { data, error: null };
        const chain = Object.assign(Promise.resolve(result), {
          select: () => chain,
          eq: () => chain,
          in: () => chain,
          maybeSingle: async () => result,
        });
        return chain;
      },
    };
  });
  mocks.cookies.set(
    mfaCookie,
    makeMfaProof(
      {
        sub: "user-a",
        session_id: "session-a",
        profile_id: "profile-a",
        organization_id: "org-a",
        factor_id: factor,
        challenge_id: challenge,
      },
      secret,
      Math.floor(Date.now() / 1000) + 120,
    ),
  );
});
afterEach(() => vi.unstubAllEnvs());
const request = () =>
  new Request("http://127.0.0.1:3000/auth/mfa/verify", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3000",
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      factor_id: factor,
      challenge_id: challenge,
      code: "123456",
    }),
  });
describe("MFA compuesto con resolución real y adaptador SSR; proveedor simulado", () => {
  it("persiste cookies del cliente writable, relee claims y admite session_id renovado", async () => {
    const response = await mfaPost(request(), "verify");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/seleccionar-organizacion",
    );
    expect(mocks.set).toHaveBeenCalledWith(
      "sb-mfa-mock",
      "test-session-cookie",
      expect.objectContaining({ path: "/", sameSite: "lax" }),
    );
    expect(mocks.cookies.get(mfaCookie)).toBe("");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("relee el perfil tras verify y deniega aunque Auth emita aal2 si se bloqueó", async () => {
    mocks.revoked = true;
    const response = await mfaPost(request(), "verify");
    expect(mocks.verify).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toContain(
      "/auth/mfa?notice=failed",
    );
    expect(mocks.profileStatus).toBe("blocked");
  });
  it("la resolución real no concede Admin a un alumno aunque sus claims digan aal2", async () => {
    mocks.role = "student";
    mocks.aal = "aal2";
    const response = await mfaPost(request(), "verify");
    expect(response.status).toBe(403);
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });
});

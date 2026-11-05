vi.mock("server-only", () => ({}));
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
const sdk = vi.hoisted(() => ({ create: vi.fn(), claims: vi.fn() }));
vi.mock("@supabase/ssr", () => ({ createServerClient: sdk.create }));
import { proxy, config } from "@/proxy";
beforeEach(() => {
  vi.clearAllMocks();
  for (const name of [
    "AUTH_EMAIL_RECOVERY_ENABLED",
    "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
    "AUTH_INVITATION_ACCEPT_ENABLED",
  ])
    vi.stubEnv(name, "false");
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
  vi.stubEnv(
    "AUTH_FLOW_SECRET",
    "test-only-not-a-real-deployment-secret".repeat(2),
  );
  sdk.create.mockReturnValue({ auth: { getClaims: sdk.claims } });
  sdk.claims.mockResolvedValue({ data: null, error: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("proxy SSR simulado", () => {
  it("demo nunca inicializa SDK y está excluida del matcher", async () => {
    await proxy(new NextRequest("http://localhost:3000/demo/o/impulso/admin"));
    expect(sdk.create).not.toHaveBeenCalled();
    expect(config.matcher).not.toContain("/demo/:path*");
  });
  it("configuración ausente no contacta Auth", async () => {
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "false");
    const r = await proxy(new NextRequest("http://localhost:3000/login"));
    expect(sdk.create).not.toHaveBeenCalled();
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("reemplaza nonce recibido y evita script unsafe-inline en rutas Auth", async () => {
    const r = await proxy(
      new NextRequest("http://localhost:3000/login", {
        headers: {
          "x-nonce": "attacker",
          "Content-Security-Policy": "attacker",
        },
      }),
    );
    const csp = r.headers.get("content-security-policy");
    expect(csp).toMatch(/nonce-/);
    expect(csp).not.toContain("attacker");
    expect(csp?.split(";")[1]).not.toContain("unsafe-inline");
  });
  it("conserva cookies de todos los setAll y sus headers de cache", async () => {
    sdk.create.mockImplementation((_url, _key, options) => {
      sdk.claims.mockImplementation(async () => {
        options.cookies.setAll(
          [{ name: "sb-chunk.0", value: "first", options: { path: "/" } }],
          { "Cache-Control": "private, no-store" },
        );
        options.cookies.setAll(
          [{ name: "sb-chunk.1", value: "second", options: { path: "/" } }],
          {},
        );
        return { data: null, error: null };
      });
      return { auth: { getClaims: sdk.claims } };
    });
    const r = await proxy(
      new NextRequest("http://localhost:3000/o/impulso/admin"),
    );
    expect(r.cookies.get("sb-chunk.0")?.value).toBe("first");
    expect(r.cookies.get("sb-chunk.1")?.value).toBe("second");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(r.headers.get("x-middleware-request-cookie")).toContain(
      "sb-chunk.1",
    );
  });
});

describe("proxy MFA", () => {
  it.each(["enroll", "challenge", "verify", "cancel"])(
    "POST /auth/mfa/%s espera CSRF del handler sin renovar antes",
    async (action) => {
      const r = await proxy(
        new NextRequest("http://localhost:3000/auth/mfa/" + action, {
          method: "POST",
          headers: { origin: "https://foreign.test" },
        }),
      );
      expect(sdk.create).not.toHaveBeenCalled();
      expect(sdk.claims).not.toHaveBeenCalled();
      expect(r.headers.get("cache-control")).toContain("no-store");
      expect(r.headers.get("content-security-policy")).toContain(
        "img-src 'self' data:",
      );
    },
  );
  it("GET de seguridad conserva renovación normal aunque correo esté apagado", async () => {
    const r = await proxy(new NextRequest("http://localhost:3000/auth/mfa"));
    expect(sdk.create).toHaveBeenCalledTimes(1);
    expect(sdk.claims).toHaveBeenCalledTimes(1);
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});

describe("proxy sin efectos para funciones apagadas", () => {
  it.each([
    "/auth/recover",
    "/auth/recuperar",
    "/auth/verify",
    "/auth/confirm",
    "/auth/password",
    "/auth/actualizar-password",
    "/auth/callback",
  ])("no renueva cookies ni consulta claims en %s", async (path) => {
    const r = await proxy(new NextRequest("http://localhost:3000" + path));
    expect(sdk.create).not.toHaveBeenCalled();
    expect(sdk.claims).not.toHaveBeenCalled();
    expect(r.cookies.getAll()).toEqual([]);
  });
});

describe("proxy y controles mixtos", () => {
  it("hash recovery no permite renovar sesión al confirmar una invitación apagada", async () => {
    vi.stubEnv("AUTH_TOKEN_HASH_RECOVERY_ENABLED", "true");
    await proxy(
      new NextRequest(
        "http://localhost:3000/auth/confirm?type=invite&token_hash=unused",
      ),
    );
    expect(sdk.create).not.toHaveBeenCalled();
    expect(sdk.claims).not.toHaveBeenCalled();
  });
  it.each(["/auth/recover", "/auth/verify", "/auth/password"])(
    "el handler %s comprueba el control antes de cualquier renovación",
    async (path) => {
      for (const name of [
        "AUTH_EMAIL_RECOVERY_ENABLED",
        "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
        "AUTH_INVITATION_ACCEPT_ENABLED",
      ])
        vi.stubEnv(name, "true");
      await proxy(
        new NextRequest("http://localhost:3000" + path, { method: "POST" }),
      );
      expect(sdk.create).not.toHaveBeenCalled();
      expect(sdk.claims).not.toHaveBeenCalled();
    },
  );
});

describe("proxy de acciones académicas", () => {
  it("el POST espera CSRF antes de renovar la sesión", async () => {
    const r = await proxy(
      new NextRequest("http://localhost:3000/o/qa/acciones", {
        method: "POST",
        headers: { origin: "https://foreign.test" },
      }),
    );
    expect(sdk.create).not.toHaveBeenCalled();
    expect(sdk.claims).not.toHaveBeenCalled();
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});

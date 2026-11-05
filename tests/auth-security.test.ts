import { describe, it, expect, vi, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
import { safeNext, sameOriginPost, readFields } from "@/lib/auth/security";
import {
  makeRecoveryProof,
  validRecoveryProof,
} from "@/lib/auth/recovery.server";
import {
  authConfig,
  authOrigin,
  SUPABASE_PROJECT_URL,
} from "@/lib/supabase/config";
afterEach(() => vi.unstubAllEnvs());
describe("redirección, origen, configuración y prueba de recuperación", () => {
  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/o/a/admin?role=admin",
    "/%2f%2fevil.test",
    "/auth/logout",
    "/demo",
    "/o/a/admin\r\nLocation: bad",
  ])("rechaza destino %s", (value) =>
    expect(safeNext(value)).toBe("/seleccionar-organizacion"),
  );
  it("admite solo paths de aplicación cerrados", () =>
    expect(safeNext("/o/impulso/admin/cursos")).toBe(
      "/o/impulso/admin/cursos",
    ));
  it("exige POST y Origin exacto; rechaza missing/null/cross-site", () => {
    for (const origin of [null, "null", "https://evil.test"]) {
      const headers = new Headers();
      if (origin) headers.set("origin", origin);
      expect(
        sameOriginPost(
          new Request("http://localhost:3000/auth/login", {
            method: "POST",
            headers,
          }),
          "http://localhost:3000",
        ),
      ).toBe(false);
    }
    expect(
      sameOriginPost(
        new Request("http://localhost:3000/auth/login", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
        "http://localhost:3000",
      ),
    ).toBe(true);
  });
  it("rechaza tipo de contenido y cuerpo grande", async () => {
    await expect(
      readFields(
        new Request("http://localhost", {
          method: "POST",
          body: "x",
          headers: { "content-type": "application/json" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      readFields(
        new Request("http://localhost", {
          method: "POST",
          body: "x".repeat(8193),
          headers: { "content-type": "application/x-www-form-urlencoded" },
        }),
      ),
    ).rejects.toThrow();
  });
  const secret = "test-only-not-a-deployment-secret".repeat(2),
    binding = {
      sub: "user-a",
      session_id: "session-a",
      purpose: "recovery" as const,
    };
  it("prueba HMAC ligada a usuario/sesión y con vencimiento", () => {
    const proof = makeRecoveryProof(binding, secret, 1000000);
    expect(validRecoveryProof(proof, binding, secret, 1000000)).toBe(true);
    expect(
      validRecoveryProof(
        proof,
        { ...binding, session_id: "other" },
        secret,
        1000000,
      ),
    ).toBe(false);
    expect(
      validRecoveryProof(proof, { ...binding, sub: "other" }, secret, 1000000),
    ).toBe(false);
    expect(validRecoveryProof(proof, binding, secret, 1600001)).toBe(false);
    expect(validRecoveryProof(proof + "x", binding, secret, 1000000)).toBe(
      false,
    );
  });
  it("rechaza orígenes inseguros y credenciales/paths", () => {
    for (const value of [
      "http://evil.test",
      "https://example.test/path",
      "https://u:p@example.test",
      "https://example.test/",
    ])
      expect(authOrigin(value)).toBeNull();
    expect(authOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });
  it("necesita habilitación explícita, origen, clave pública y secreto privado", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_PROJECT_URL);
    vi.stubEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "sb_publishable_TEST_ONLY_NOT_A_REAL_KEY_123456",
    );
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv("AUTH_FLOW_SECRET", secret);
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "false");
    expect(authConfig()).toBeNull();
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "true");
    expect(authConfig()).not.toBeNull();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_secret_FORBIDDEN");
    expect(authConfig()).toBeNull();
  });
});

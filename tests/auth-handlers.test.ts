import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  set: vi.fn(),
  create: vi.fn(),
  client: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      verifyOtp: vi.fn(),
      getUser: vi.fn(),
      getClaims: vi.fn(),
      updateUser: vi.fn(),
      exchangeCodeForSession: vi.fn(),
    },
  },
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
import { authPost, authCallback } from "@/lib/auth/handlers.server";
import { recoveryCookie, makeRecoveryProof } from "@/lib/auth/recovery.server";
const secret = "test-only-not-a-real-deployment-secret".repeat(2);
const request = (
  action: string,
  fields: Record<string, string>,
  origin = "http://localhost:3000",
) =>
  new Request("http://localhost:3000/auth/" + action, {
    method: "POST",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookies.clear();
  mocks.create.mockResolvedValue(mocks.client);
  for (const name of [
    "AUTH_EMAIL_RECOVERY_ENABLED",
    "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
    "AUTH_INVITATION_ACCEPT_ENABLED",
  ])
    vi.stubEnv(name, "true");
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
  for (const fn of Object.values(mocks.client.auth))
    fn.mockResolvedValue({ error: null });
  mocks.client.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-a" } },
    error: null,
  });
  mocks.client.auth.getClaims.mockResolvedValue({
    data: { claims: { sub: "user-a", session_id: "session-a" } },
    error: null,
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("handlers Auth simulados; no contactan Cloud", () => {
  it.each([
    ["Origin ausente", undefined, "same-origin"],
    ["Origin opaco", "null", "same-origin"],
    ["otro host local", "http://127.0.0.1:3000", "same-origin"],
    ["otro puerto", "http://localhost:3001", "same-origin"],
    ["origen externo", "https://evil.test", "cross-site"],
    ["Fetch Metadata cross-site", "http://localhost:3000", "cross-site"],
    ["Fetch Metadata same-site", "http://localhost:3000", "same-site"],
  ])(
    "mantiene el rechazo CSRF: %s, sin leer el cuerpo ni llamar Auth",
    async (_label, origin, site) => {
      const req = request("login", {
        email: "synthetic@example.test",
        password: "not-a-real-password",
      });
      if (origin) req.headers.set("origin", origin);
      else req.headers.delete("origin");
      req.headers.set("sec-fetch-site", site!);
      req.headers.set("sec-fetch-mode", "navigate");
      const response = await authPost(req, "login");
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({ error: "Origen no permitido." });
      expect(req.bodyUsed).toBe(false);
      expect(mocks.create).not.toHaveBeenCalled();
      expect(mocks.client.auth.signInWithPassword).not.toHaveBeenCalled();
    },
  );
  it("rechaza CSRF antes de llamar Auth", async () => {
    const r = await authPost(
      request(
        "login",
        { email: "a@example.test", password: "not-a-real-password" },
        "https://evil.test",
      ),
      "login",
    );
    expect(r.status).toBe(403);
    expect(mocks.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("login usa destino cerrado y respuesta no cacheable", async () => {
    const r = await authPost(
      request("login", {
        email: "a@example.test",
        password: "not-a-real-password",
        next: "https://evil.test",
        role: "admin",
      }),
      "login",
    );
    expect(r.headers.get("location")).toBe(
      "http://localhost:3000/seleccionar-organizacion",
    );
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it("credenciales inválidas no reflejan el error del proveedor", async () => {
    mocks.client.auth.signInWithPassword.mockResolvedValue({
      error: Error("private detail"),
    });
    const r = await authPost(
      request("login", {
        email: "a@example.test",
        password: "not-a-real-password",
      }),
      "login",
    );
    expect(r.headers.get("location")).toContain("notice=credentials");
    expect(await r.text()).not.toContain("private detail");
  });
  it("recuperación responde igual si la cuenta es desconocida", async () => {
    mocks.client.auth.resetPasswordForEmail.mockResolvedValue({
      error: Error("not found"),
    });
    const r = await authPost(
      request("recover", { email: "a@example.test" }),
      "recover",
    );
    expect(r.headers.get("location")).toContain("notice=sent");
  });
  it("logout borra chunks y prueba aun cuando Auth cae", async () => {
    mocks.client.auth.signOut.mockRejectedValue(Error("offline"));
    mocks.cookies.set("sb-rnxgrunnrdlgjsbsrjev-auth-token.0", "fake-cookie");
    const r = await authPost(request("logout", { intent: "logout" }), "logout");
    expect(r.headers.get("location")).toContain("logged_out");
    expect(mocks.set).toHaveBeenCalledWith(
      "sb-rnxgrunnrdlgjsbsrjev-auth-token.0",
      "",
      expect.objectContaining({ maxAge: 0 }),
    );
    expect(mocks.set).toHaveBeenCalledWith(
      recoveryCookie,
      "",
      expect.objectContaining({ httpOnly: true, maxAge: 0 }),
    );
  });
  it("no actualiza contraseña sin prueba ligada a sesión", async () => {
    const r = await authPost(
      request("password", {
        password: "mock-password-1234",
        confirmation: "mock-password-1234",
      }),
      "password",
    );
    expect(r.headers.get("location")).toContain("callback_failed");
    expect(mocks.client.auth.updateUser).not.toHaveBeenCalled();
  });
  it("actualiza solo con prueba verificada y después cierra sesión", async () => {
    mocks.cookies.set(
      recoveryCookie,
      makeRecoveryProof(
        { sub: "user-a", session_id: "session-a", purpose: "recovery" },
        secret,
      ),
    );
    const r = await authPost(
      request("password", {
        password: "mock-password-1234",
        confirmation: "mock-password-1234",
      }),
      "password",
    );
    expect(r.headers.get("location")).toContain("password_updated");
    expect(mocks.client.auth.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("confirmación rechaza signup y no crea membresías", async () => {
    const r = await authPost(
      request("verify", { type: "signup", token_hash: "a".repeat(64) }),
      "confirm",
    );
    expect(r.headers.get("location")).toContain("callback_failed");
    expect(mocks.client.auth.verifyOtp).not.toHaveBeenCalled();
  });
  it("confirmación de recuperación emite prueba solo tras verifyOtp e identidad", async () => {
    const r = await authPost(
      request("verify", { type: "recovery", token_hash: "a".repeat(64) }),
      "confirm",
    );
    expect(r.headers.get("location")).toContain("actualizar-password");
    expect(mocks.set).toHaveBeenCalledWith(
      recoveryCookie,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/auth", maxAge: 600 }),
    );
  });
  it("callback PKCE no respeta next externo", async () => {
    const r = await authCallback(
      new Request(
        "http://localhost:3000/auth/callback?code=fake-code&next=https://evil.test",
      ),
    );
    expect(r.headers.get("location")).toBe(
      "http://localhost:3000/seleccionar-organizacion",
    );
  });
  it("error callback elimina código de la redirección", async () => {
    mocks.client.auth.exchangeCodeForSession.mockResolvedValue({
      error: Error("bad code"),
    });
    const r = await authCallback(
      new Request("http://localhost:3000/auth/callback?code=fake-code"),
    );
    expect(r.headers.get("location")).not.toContain("fake-code");
    expect(r.headers.get("location")).toContain("callback_failed");
  });
  it("configuración ausente deniega sin llamar al proveedor", async () => {
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "false");
    const r = await authPost(request("login", {}), "login");
    expect(r.status).toBe(503);
    expect(mocks.client.auth.signInWithPassword).not.toHaveBeenCalled();
  });
});

describe("controles privados: operaciones cerradas sin consumir material Auth", () => {
  const disableAll = () => {
    for (const key of [
      "AUTH_EMAIL_RECOVERY_ENABLED",
      "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
      "AUTH_INVITATION_ACCEPT_ENABLED",
    ])
      vi.stubEnv(key, "false");
  };
  const noProvider = () => {
    expect(mocks.create).not.toHaveBeenCalled();
    for (const fn of Object.values(mocks.client.auth))
      expect(fn).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  };
  it("sin valores explícitos permanecen cerrados con login global habilitado", async () => {
    for (const key of [
      "AUTH_EMAIL_RECOVERY_ENABLED",
      "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
      "AUTH_INVITATION_ACCEPT_ENABLED",
    ])
      vi.stubEnv(key, undefined);
    const r = await authPost(
      request("recover", { email: "a@example.test" }),
      "recover",
    );
    expect(r.status).toBe(503);
    noProvider();
  });
  it("correo apagado no ejecuta resetPasswordForEmail ni crea cliente", async () => {
    vi.stubEnv("AUTH_EMAIL_RECOVERY_ENABLED", "false");
    const r = await authPost(
      request("recover", { email: "a@example.test" }),
      "recover",
    );
    expect(r.status).toBe(503);
    noProvider();
  });
  it.each(["recovery", "invite"])(
    "verify %s directo no consume OTP con todo apagado",
    async (type) => {
      disableAll();
      const r = await authPost(
        request("verify", { type, token_hash: "a".repeat(64) }),
        "confirm",
      );
      expect(r.status).toBe(503);
      expect(r.headers.get("cache-control")).toContain("no-store");
      noProvider();
    },
  );
  it.each([
    ["recovery", "AUTH_TOKEN_HASH_RECOVERY_ENABLED"],
    ["invite", "AUTH_INVITATION_ACCEPT_ENABLED"],
  ])("control independiente de verify %s", async (type, flag) => {
    vi.stubEnv(flag, "false");
    const r = await authPost(
      request("verify", { type, token_hash: "a".repeat(64) }),
      "confirm",
    );
    expect(r.status).toBe(503);
    noProvider();
  });
  it.each(["recovery", "invite"] as const)(
    "contraseña con ticket válido %s desactivado no consulta Auth",
    async (purpose) => {
      disableAll();
      vi.stubEnv(
        purpose === "recovery"
          ? "AUTH_INVITATION_ACCEPT_ENABLED"
          : "AUTH_TOKEN_HASH_RECOVERY_ENABLED",
        "true",
      );
      const proof = makeRecoveryProof(
        { sub: "user-a", session_id: "session-a", purpose },
        secret,
      );
      mocks.cookies.set(recoveryCookie, proof);
      const r = await authPost(
        request("password", {
          password: "mock-password-1234",
          confirmation: "mock-password-1234",
        }),
        "password",
      );
      expect(r.status).toBe(503);
      noProvider();
      expect(mocks.cookies.get(recoveryCookie)).toBe(proof);
    },
  );
  it("password directo con todos apagados tampoco consume ticket", async () => {
    disableAll();
    mocks.cookies.set(
      recoveryCookie,
      makeRecoveryProof(
        { sub: "user-a", session_id: "session-a", purpose: "recovery" },
        secret,
      ),
    );
    const r = await authPost(
      request("password", {
        password: "mock-password-1234",
        confirmation: "mock-password-1234",
      }),
      "password",
    );
    expect(r.status).toBe(503);
    noProvider();
  });
  it("callback no intercambia código aunque un flujo token_hash esté permitido", async () => {
    vi.stubEnv("AUTH_EMAIL_RECOVERY_ENABLED", "false");
    const r = await authCallback(
      new Request("http://localhost:3000/auth/callback?code=unused"),
    );
    expect(r.status).toBe(503);
    noProvider();
  });
  it("login funciona con los tres controles apagados sin correo, OTP ni canje de código", async () => {
    disableAll();
    const r = await authPost(
      request("login", {
        email: "a@example.test",
        password: "not-a-real-password",
      }),
      "login",
    );
    expect(r.status).toBe(303);
    expect(mocks.client.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    expect(mocks.client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
    expect(mocks.client.auth.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.client.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });
  it("logout se mantiene operativo con correo e invitaciones apagados", async () => {
    disableAll();
    const r = await authPost(request("logout", { intent: "logout" }), "logout");
    expect(r.status).toBe(303);
    expect(mocks.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.client.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("invitación explícitamente permitida no necesita recuperación activada", async () => {
    disableAll();
    vi.stubEnv("AUTH_INVITATION_ACCEPT_ENABLED", "true");
    const r = await authPost(
      request("verify", { type: "invite", token_hash: "a".repeat(64) }),
      "confirm",
    );
    expect(r.status).toBe(303);
    expect(mocks.client.auth.verifyOtp).toHaveBeenCalledWith({
      type: "invite",
      token_hash: "a".repeat(64),
    });
    const ticket = mocks.set.mock.calls.find(
      (call) => call[0] === recoveryCookie && call[1],
    )?.[1];
    expect(
      JSON.parse(
        Buffer.from(ticket.split(".")[0], "base64url").toString("utf8"),
      ).purpose,
    ).toBe("invite");
  });
});

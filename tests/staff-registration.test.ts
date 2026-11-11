import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  userRpc: vi.fn(),
  privilegedRpc: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/lib/auth/session.server", () => ({ readSession: mocks.session }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: () => ({ rpc: mocks.userRpc }),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));

import { POST as activate } from "@/app/auth/activar-personal/acciones/route";
import { staffPost } from "@/features/staff/handlers.server";
import type { AuthenticatedSession } from "@/lib/auth/resolve";

const org = "11111111-1111-4111-8111-111111111111";
const profile = "22222222-2222-4222-8222-222222222222";
const registration = "33333333-3333-4333-8333-333333333333";
const authUser = "44444444-4444-4444-8444-444444444444";
const previousClaim = "55555555-5555-4555-8555-555555555555";
const origin = "http://127.0.0.1:3000";
const identifier = "u-teststaff@cuentas.sistema-alumnos.invalid";
const sampleCode = "x".repeat(43);
const chosenPassword = "Local test only 2026";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

function session(): AuthenticatedSession {
  return {
    status: "authenticated",
    user: { id: authUser },
    identity: {
      profileId: profile,
      authUserId: authUser,
      status: "active",
      assuranceLevel: "aal2",
    },
    memberships: [
      {
        organizationId: org,
        profileId: profile,
        organizationStatus: "active",
        status: "active",
        role: "admin",
        staffRank: "principal",
        allowedModules: [],
        slug: "qa",
        name: "QA",
      },
    ],
  };
}

const register = {
  action: "register",
  first_name: "  Nombre ",
  last_name: " Apellidos ",
  identifier: identifier.toUpperCase(),
  rank: "teacher",
  module: "attendance",
  assignment: "confirmed",
  organization_id: "IGNORAR",
  actor: "IGNORAR",
  aal: "IGNORAR",
};
const activation = {
  identifier,
  code: sampleCode,
  password: chosenPassword,
  confirmation: chosenPassword,
};
function post(
  body: Record<string, string>,
  headers: Record<string, string> = {},
) {
  return new Request(origin + "/post", {
    method: "POST",
    headers: { origin, "sec-fetch-site": "same-origin", ...headers },
    body: new URLSearchParams(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_AUTH_ENABLED", "true");
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://rnxgrunnrdlgjsbsrjev.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_TEST_ONLY_NOT_REAL_123456",
  );
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("AUTH_FLOW_SECRET", "test-only-not-a-deployment-secret".repeat(2));
  vi.stubEnv("STAFF_REGISTRATION_ENABLED", "true");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv(
    "SUPABASE_STAFF_SECRET_KEY",
    "sb_secret_TEST_ONLY_NOT_REAL_123456",
  );
  mocks.session.mockResolvedValue(session());
  mocks.client.mockReturnValue({
    rpc: mocks.privilegedRpc,
    auth: {
      admin: { createUser: mocks.createUser, updateUserById: mocks.updateUser },
    },
  });
  mocks.userRpc.mockResolvedValue({
    data: { identifier, actor: profile, claim: null, authReady: false },
  });
  mocks.privilegedRpc.mockImplementation(async (name: string) => ({
    data:
      name === "reserve_staff_registration"
        ? registration
        : name === "claim_staff_activation"
          ? { registration, authUser }
          : true,
  }));
  mocks.createUser.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("alta de personal", () => {
  it.each([
    "aal1",
    "teacher",
    "secretary",
    "administrator",
    "student",
    "other-org",
  ])(
    "rechaza %s antes de inicializar el cliente privilegiado",
    async (kind) => {
      const actor = session();
      if (kind === "aal1")
        actor.identity = { ...actor.identity!, assuranceLevel: "aal1" };
      if (
        kind === "teacher" ||
        kind === "secretary" ||
        kind === "administrator"
      ) {
        actor.memberships[0] = { ...actor.memberships[0]!, staffRank: kind };
      }
      if (kind === "student") {
        actor.memberships[0] = {
          ...actor.memberships[0]!,
          role: "student",
          staffRank: null,
        };
      }
      mocks.session.mockResolvedValue(actor);
      expect(
        (await staffPost(post(register), kind === "other-org" ? "otra" : "qa"))
          .status,
      ).toBe(403);
      expect(mocks.client).not.toHaveBeenCalled();
      expect(mocks.userRpc).not.toHaveBeenCalled();
    },
  );

  it("CSRF rechaza el alta y la activación antes de acceder a Supabase", async () => {
    expect(
      (await staffPost(post(register, { origin: "https://otro.test" }), "qa"))
        .status,
    ).toBe(403);
    expect(
      (await activate(post(activation, { "sec-fetch-site": "cross-site" })))
        .status,
    ).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("la falta de habilitación o clave privada bloquea POST directos", async () => {
    vi.stubEnv("STAFF_REGISTRATION_ENABLED", "false");
    expect((await staffPost(post(register), "qa")).status).toBe(503);
    vi.stubEnv("STAFF_REGISTRATION_ENABLED", "true");
    vi.stubEnv("SUPABASE_STAFF_SECRET_KEY", "");
    expect((await activate(post(activation))).status).toBe(503);
    expect(mocks.client).not.toHaveBeenCalled();
    expect(mocks.privilegedRpc).not.toHaveBeenCalled();
  });

  it.each([
    { rank: "principal" },
    { module: "staff.manage" },
    { module: "certificates" },
    { assignment: "" },
    { identifier: "u-test@example.test" },
  ])("rechaza un alta manipulada %o", async (patch) => {
    expect(
      (await staffPost(post({ ...register, ...patch }), "qa")).status,
    ).toBe(400);
    expect(mocks.userRpc).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("registra el rango y módulos elegidos y muestra el código solo en la respuesta privada", async () => {
    const response = await staffPost(post(register), "qa");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private");
    expect(response.headers.get("cache-control")).toContain("no-store");
    const html = await response.text();
    const code = html.match(/<code>([\w-]{43})<\/code>/)?.[1];
    expect(code).toBeDefined();
    expect(mocks.privilegedRpc).toHaveBeenCalledWith(
      "reserve_staff_registration",
      {
        p_org: org,
        p_actor: profile,
        p_aal: "aal2",
        p_identifier: identifier,
        p_first_name: "Nombre",
        p_last_name: "Apellidos",
        p_rank: "teacher",
        p_modules: ["attendance"],
      },
    );
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: identifier,
      email_confirm: true,
      password: expect.stringMatching(/^[\w-]{48}$/),
      app_metadata: { staff_registration_id: registration },
    });
    const initialPassword = mocks.createUser.mock.calls[0]![0]
      .password as string;
    expect(html).not.toContain(initialPassword);
    expect(mocks.privilegedRpc).toHaveBeenCalledWith("issue_staff_activation", {
      p_org: org,
      p_registration: registration,
      p_actor: profile,
      p_digest: digest(code!),
    });
    expect(html).not.toContain("sb_secret_");
  });

  it("rechaza un duplicado sin crear ni adoptar la identidad", async () => {
    mocks.privilegedRpc.mockResolvedValueOnce({
      error: { code: "23505", message: "DETALLE_PRIVADO" },
    });
    const response = await staffPost(post(register), "qa");
    expect(response.headers.get("location")).toContain("staff_duplicate");
    expect(await response.text()).not.toContain("DETALLE_PRIVADO");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.privilegedRpc).toHaveBeenCalledTimes(1);
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });

  it("el límite temporal de reserva impide intentar la creación en Auth", async () => {
    mocks.privilegedRpc.mockResolvedValueOnce({ error: { code: "54000" } });
    expect(
      (await staffPost(post(register), "qa")).headers.get("location"),
    ).toContain("staff_rate_limited");
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.userRpc).not.toHaveBeenCalled();
  });

  it("tras un fallo parcial de alta, prepara otro código para la identidad exacta", async () => {
    mocks.createUser.mockRejectedValueOnce(new Error("DETALLE_PRIVADO"));
    expect(
      (await staffPost(post(register), "qa")).headers.get("location"),
    ).toContain("staff_pending");
    mocks.userRpc.mockResolvedValueOnce({
      data: { identifier, actor: profile, claim: null, authReady: true },
    });
    const response = await staffPost(
      post({ action: "deliver", id: registration }),
      "qa",
    );
    expect(response.status).toBe(200);
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
    expect(mocks.privilegedRpc).toHaveBeenCalledTimes(2);
  });

  it("cancela un alta pendiente sin llamar a Supabase Auth", async () => {
    mocks.userRpc.mockResolvedValueOnce({ data: registration });
    const response = await staffPost(
      post({ action: "cancel_registration", id: registration }),
      "qa",
    );
    expect(response.headers.get("location")).toContain(
      "notice=staff_cancelled",
    );
    expect(mocks.userRpc).toHaveBeenCalledWith("cancel_staff_registration", {
      p_org: org,
      p_registration: registration,
    });
    expect(mocks.privilegedRpc).not.toHaveBeenCalled();
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("conserva la vinculación anterior con el alta deshabilitada", async () => {
    vi.stubEnv("STAFF_REGISTRATION_ENABLED", "false");
    const response = await staffPost(
      post({
        action: "link",
        id: registration,
        rank: "administrator",
        status: "active",
      }),
      "qa",
    );
    expect(response.headers.get("location")).toContain("notice=linked");
    expect(mocks.userRpc).toHaveBeenCalledWith(
      "link_staff",
      expect.objectContaining({ p_assignment: registration }),
    );
    expect(mocks.client).not.toHaveBeenCalled();
  });
});

describe("activación de personal", () => {
  it("en Vercel usa solo la IP de plataforma y la convierte en una clave opaca", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_ENV", "preview");
    for (const ip of [
      "2001:db8::1",
      "2001:0db8:0000:0000:0000:0000:0000:0001",
    ]) {
      await activate(
        post(activation, {
          "x-vercel-forwarded-for": ip,
          "x-forwarded-for": "192.0.2.77",
        }),
      );
    }
    const networks = mocks.privilegedRpc.mock.calls
      .filter(([name]) => name === "claim_staff_activation")
      .map(([, args]) => args.p_network);
    expect(networks).toHaveLength(2);
    expect(networks[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(networks[0]).toBe(networks[1]);
    expect(networks[0]).not.toBe(digest("2001:db8::1"));
  });

  it.each([
    ["", "", "192.0.2.1"],
    ["1", "development", "192.0.2.1"],
    ["1", "production", "192.0.2.1, 192.0.2.2"],
    ["1", "production", "fe80::1%eth0"],
    ["1", "production", ""],
  ])(
    "ignora encabezados sin un origen verificable o una IP individual",
    async (vercel, environment, ip) => {
      vi.stubEnv("VERCEL", vercel);
      vi.stubEnv("VERCEL_ENV", environment);
      await activate(
        post(activation, {
          "x-vercel-forwarded-for": ip,
          "x-forwarded-for": "192.0.2.77",
          "x-real-ip": "192.0.2.88",
        }),
      );
      expect(mocks.privilegedRpc).toHaveBeenCalledWith(
        "claim_staff_activation",
        expect.objectContaining({ p_network: "" }),
      );
    },
  );

  it("reserva el hash antes de enviar a Auth la contraseña elegida por el titular", async () => {
    const response = await activate(post(activation));
    const claim = mocks.privilegedRpc.mock.calls[0]![1].p_claim;
    expect(mocks.privilegedRpc).toHaveBeenNthCalledWith(
      1,
      "claim_staff_activation",
      {
        p_identifier: identifier,
        p_digest: digest(sampleCode),
        p_claim: claim,
        p_network: "",
      },
    );
    expect(mocks.updateUser).toHaveBeenCalledWith(authUser, {
      password: chosenPassword,
      app_metadata: { staff_activation_claim: claim },
    });
    expect(mocks.privilegedRpc).toHaveBeenNthCalledWith(
      2,
      "finish_staff_activation",
      {
        p_registration: registration,
        p_claim: claim,
        p_rejected: false,
      },
    );
    expect(response.headers.get("location")).toBe(
      origin + "/login?notice=password_updated",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.text()).not.toMatch(
      new RegExp(sampleCode + "|" + chosenPassword),
    );
  });

  it.each([
    { confirmation: "distinta" },
    { password: "🔒".repeat(25), confirmation: "🔒".repeat(25) },
  ])("un formulario inválido no reclama el código", async (patch) => {
    const result = await activate(post({ ...activation, ...patch }));
    expect(result.headers.get("location")).toContain("notice=invalid");
    expect(mocks.privilegedRpc).not.toHaveBeenCalled();
  });

  it.each(["vencido", "consumido", "desconocido", "limitado"])(
    "un código %s recibe la misma respuesta y nunca modifica la contraseña",
    async () => {
      mocks.privilegedRpc.mockResolvedValueOnce({ data: null });
      const response = await activate(post(activation));
      expect(response.headers.get("location")).toBe(
        origin + "/auth/activar-personal?notice=invalid",
      );
      expect(mocks.updateUser).not.toHaveBeenCalled();
    },
  );

  it("un fallo ambiguo se concilia sin volver a actualizar la contraseña", async () => {
    mocks.updateUser.mockRejectedValueOnce(new Error("DETALLE_PRIVADO"));
    expect(
      (await activate(post(activation))).headers.get("location"),
    ).toContain("notice=pending");
    mocks.userRpc.mockResolvedValueOnce({
      data: {
        identifier,
        actor: profile,
        claim: previousClaim,
        authReady: true,
      },
    });
    const review = await staffPost(
      post({ action: "deliver", id: registration }),
      "qa",
    );
    expect(review.headers.get("location")).toContain("staff_activated");
    expect(mocks.privilegedRpc).toHaveBeenLastCalledWith(
      "finish_staff_activation",
      {
        p_registration: registration,
        p_claim: previousClaim,
        p_rejected: false,
      },
    );
    expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
  });

  it.each([
    [422, "weak_password", true],
    [503, "unexpected_failure", false],
  ])(
    "solo un rechazo definitivo autoriza liberar la reclamación para reemitir",
    async (status, code, definitive) => {
      mocks.updateUser.mockResolvedValueOnce({ error: { status, code } });
      mocks.privilegedRpc
        .mockResolvedValueOnce({ data: { registration, authUser } })
        .mockResolvedValueOnce({ data: false });
      const response = await activate(post(activation));
      expect(response.headers.get("location")).toContain("notice=pending");
      expect(mocks.privilegedRpc).toHaveBeenLastCalledWith(
        "finish_staff_activation",
        expect.objectContaining({ p_rejected: definitive }),
      );
    },
  );
});

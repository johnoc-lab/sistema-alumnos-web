import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  create: vi.fn(),
  rpc: vi.fn(),
  signIn: vi.fn(),
  update: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

import RegistrationPage from "@/app/auth/crear-cuenta/page";
import {
  registerStudent,
  recoverStudent,
  studentAccessDigest,
} from "@/features/auth/student-registration.server";

const origin = "http://127.0.0.1:3000";
const secret = "sb_secret_SYNTHETIC__FOR_LOCAL_TESTS_123";
const id = "11111111-1111-4111-8111-111111111111";
const authId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const identifier = "u-mariaflores@cuentas.sistema-alumnos.invalid";
const password = "Synthetic-password-2026";
const base = {
  organization: "incubadora",
  code: id + "." + "C".repeat(32),
  proof: "P".repeat(32),
  password,
  confirmation: password,
};
const enrollment = {
  ...base,
  username: "MARIAFLORES",
  first_name: "María",
  last_name: "Flores",
};
const request = (fields: Record<string, string>, source = origin) =>
  new Request(origin + "/auth/test", {
    method: "POST",
    headers: { origin: source },
    body: new URLSearchParams(fields),
  });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("SUPABASE_AUTH_ENABLED", "true");
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_URL",
    "https://rnxgrunnrdlgjsbsrjev.supabase.co",
  );
  vi.stubEnv(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "sb_publishable_SYNTHETIC_FOR_TESTS_12345",
  );
  vi.stubEnv("AUTH_FLOW_SECRET", "TEST-ONLY-NOT-A-DEPLOYMENT-SECRET".repeat(2));
  vi.stubEnv("STUDENT_REGISTRATION_ENABLED", "true");
  vi.stubEnv("SUPABASE_STUDENT_SECRET_KEY", secret);
  mocks.createClient.mockImplementation((_url, key) =>
    key === secret
      ? {
          rpc: mocks.rpc,
          auth: {
            admin: {
              createUser: mocks.create,
              updateUserById: mocks.update,
              signOut: mocks.signOut,
            },
          },
        }
      : { auth: { signInWithPassword: mocks.signIn } },
  );
  mocks.create.mockResolvedValue({ data: { user: { id: authId } } });
  mocks.rpc.mockImplementation(async (name) => ({
    data:
      name === "claim_student_access"
        ? { id, identifier, attemptId, phase: "create_account" }
        : true,
  }));
  mocks.update.mockResolvedValue({});
  mocks.signOut.mockResolvedValue({});
  mocks.signIn.mockResolvedValue({
    data: {
      user: { id: authId },
      session: { access_token: "synthetic-local-token" },
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("autorregistro y recuperación institucional", () => {
  it("selecciona la modalidad automática y presenta el correo personal como pendiente", async () => {
    const html = renderToStaticMarkup(
      await RegistrationPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain("Generar mi identificador automáticamente");
    expect(html).toMatch(/<input[^>]+disabled[^>]*\/> Usar correo personal/);
    expect(html).toContain('name="username"');
    expect(html).toContain('name="proof"');
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain("sistema-alumnos.invalid");
    expect(html).not.toContain(secret);
  });

  it("rechaza correo personal, rol inyectado, contraseña distinta y origen externo antes del SDK", async () => {
    for (const patch of [
      { email: "maria@example.test" },
      { role: "admin" },
      { confirmation: "different" },
    ])
      expect(
        (
          await registerStudent(
            request({ ...enrollment, ...patch } as Record<string, string>),
          )
        ).headers.get("location"),
      ).toContain("notice=invalid");
    expect(
      (await registerStudent(request(enrollment, "https://otro.example")))
        .status,
    ).toBe(403);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("canjea ambas pruebas y genera un único identificador técnico sin mostrarlo completo", async () => {
    const result = await registerStudent(request(enrollment));
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    const text = await result.text();
    expect(text).toContain("<strong>mariaflores</strong>");
    expect(text).not.toContain(identifier);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "claim_student_access", {
      p_id: id,
      p_slug: "incubadora",
      p_purpose: "enroll",
      p_identifier: identifier,
      p_code: studentAccessDigest("C".repeat(32)),
      p_proof: studentAccessDigest(base.proof),
      p_network: "",
    });
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith({
      email: identifier,
      password,
      email_confirm: true,
      app_metadata: { student_access_authorization: id },
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "finalize_student_access", {
      p_id: id,
      p_auth: authId,
      p_attempt: attemptId,
      p_first: "María",
      p_last: "Flores",
    });
  });

  it("mantiene la respuesta genérica y no toca Auth si las pruebas o la reserva fallan", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null });
    const result = await registerStudent(request(enrollment));
    expect(result.headers.get("location")).toContain("notice=unavailable");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  function claimPhase(phase: string) {
    mocks.rpc.mockResolvedValueOnce({
      data: { id, identifier, attemptId, authUserId: authId, phase },
    });
  }

  it("conserva la identidad si falla la vinculación y exige otra autorización para conciliarla", async () => {
    mocks.rpc
      .mockResolvedValueOnce({
        data: { id, attemptId, identifier, phase: "create_account" },
      })
      .mockResolvedValueOnce({ data: false })
      .mockResolvedValueOnce({ data: null });
    expect(
      (await registerStudent(request(enrollment))).headers.get("location"),
    ).toContain("notice=unavailable");
    expect(
      (await registerStudent(request(enrollment))).headers.get("location"),
    ).toContain("notice=unavailable");
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();

    claimPhase("update_password");
    expect(
      (await registerStudent(request({ ...enrollment, proof: "X".repeat(32) })))
        .status,
    ).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(authId, {
      password,
      app_metadata: { student_access_password_attempt: attemptId },
    });
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "finalize_student_access",
      expect.objectContaining({ p_auth: authId, p_attempt: attemptId }),
    );
  });

  it("registra la contraseña cambiada y reintenta solo el cierre si el proveedor falla", async () => {
    claimPhase("update_password");
    mocks.signOut.mockResolvedValueOnce({ error: new Error("private detail") });
    const first = await recoverStudent(request(base));
    expect(first.headers.get("location")).toContain(
      "notice=revocation_pending",
    );
    expect(await first.text()).not.toContain("private detail");
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "record_student_access_progress",
      {
        p_id: id,
        p_attempt: attemptId,
        p_auth: authId,
        p_stage: "password_changed",
      },
    );

    claimPhase("revoke_sessions");
    const retry = await recoverStudent(request(base));
    expect(retry.headers.get("location")).toContain("notice=password_updated");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(authId, {
      password,
      app_metadata: { student_access_password_attempt: attemptId },
    });
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.signOut).toHaveBeenLastCalledWith(
      "synthetic-local-token",
      "global",
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_student_access_progress",
      expect.objectContaining({
        p_attempt: attemptId,
        p_stage: "sessions_revoked",
      }),
    );
  });

  it("un cambio de contraseña sin confirmación se consulta sin repetir la escritura", async () => {
    claimPhase("update_password");
    mocks.update.mockRejectedValueOnce(new Error("simulated timeout"));
    expect(
      (await recoverStudent(request(base))).headers.get("location"),
    ).toContain("notice=password_pending");

    claimPhase("password_pending");
    expect(
      (await recoverStudent(request(base))).headers.get("location"),
    ).toContain("notice=password_pending");
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();

    claimPhase("revoke_sessions");
    expect(
      (await recoverStudent(request(base))).headers.get("location"),
    ).toContain("notice=password_updated");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("una revocación registrada puede finalizar sin cambiar la contraseña ni iniciar sesión otra vez", async () => {
    claimPhase("finalize");
    expect(
      (await recoverStudent(request(base))).headers.get("location"),
    ).toContain("notice=password_updated");
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.signIn).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("un rechazo explícito permite notificar que la contraseña fue rechazada", async () => {
    claimPhase("update_password");
    mocks.update.mockResolvedValueOnce({
      error: { code: "weak_password", status: 422 },
    });
    expect(
      (await recoverStudent(request(base))).headers.get("location"),
    ).toContain("notice=password_rejected");
    expect(mocks.rpc).toHaveBeenLastCalledWith(
      "record_student_access_progress",
      expect.objectContaining({
        p_attempt: attemptId,
        p_stage: "password_rejected",
      }),
    );
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});

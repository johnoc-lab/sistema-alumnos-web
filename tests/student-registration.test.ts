import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  createUser: vi.fn(),
  signIn: vi.fn(),
  organization: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.client }));

import { LoginScreen } from "@/features/auth/components/login-screen";
import RegistrationPage from "@/app/auth/crear-cuenta/page";
import { POST } from "@/app/auth/crear-cuenta/acciones/route";

const origin = "http://127.0.0.1:3000";
const adminKey = "sb_secret_SYNTHETIC_FOR_TESTS_ONLY_12345";
const email = "student-demo@example.test";
const slug = "incubadora";
const identity = {
  id: "11111111-1111-4111-8111-111111111111",
  email,
  app_metadata: { student_registration_organization: slug },
};
const fields = {
  first_name: "Ana",
  last_name: "Muñoz",
  email,
  password: "QA-only-passphrase",
  organization: slug,
};
function submit(
  input: typeof fields & Record<string, string> = fields,
  site = origin,
) {
  return POST(
    new Request(origin + "/auth/crear-cuenta/acciones", {
      method: "POST",
      headers: {
        origin: site,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(input),
    }),
  );
}
function duplicate() {
  mocks.createUser.mockResolvedValue({
    data: { user: null },
    error: { code: "email_exists" },
  });
}
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
  vi.stubEnv("SUPABASE_STUDENT_SECRET_KEY", adminKey);
  vi.stubEnv("STUDENT_REGISTRATION_ALLOWLIST", JSON.stringify([[email, slug]]));
  mocks.client.mockImplementation((_url, key) =>
    key === adminKey
      ? {
          from: () => {
            const query = {
              select: () => query,
              eq: () => query,
              maybeSingle: mocks.organization,
            };
            return query;
          },
          auth: { admin: { createUser: mocks.createUser } },
          rpc: mocks.rpc,
        }
      : { auth: { signInWithPassword: mocks.signIn } },
  );
  mocks.organization.mockResolvedValue({
    data: { id: "org-enabled" },
    error: null,
  });
  mocks.createUser.mockResolvedValue({ data: { user: identity }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("alta QA de alumnos con proveedor simulado", () => {
  it("muestra solo las dos instituciones autorizadas y oculta el enlace si está apagado", async () => {
    const html = renderToStaticMarkup(
      await RegistrationPage({ searchParams: Promise.resolve({}) }),
    );
    expect(html).toContain('value="impulso-cero"');
    expect(html).toContain('value="incubadora"');
    expect(html).not.toContain("qa-sistema-alumnos-01");
    expect(html).not.toContain(adminKey);
    expect(html).not.toContain(email);
    expect(renderToStaticMarkup(LoginScreen({}))).toContain(
      'href="/auth/crear-cuenta"',
    );
    vi.stubEnv("STUDENT_REGISTRATION_ENABLED", "false");
    expect(renderToStaticMarkup(LoginScreen({}))).not.toContain(
      'href="/auth/crear-cuenta"',
    );
    expect((await submit()).status).toBe(503);
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("rechaza correo no asignado, institución inválida, rol inyectado y POST cross-site antes del SDK", async () => {
    expect(
      (await submit({ ...fields, organization: "impulso-cero" })).headers.get(
        "location",
      ),
    ).toContain("notice=unavailable");
    expect(
      (
        await submit({ ...fields, organization: "qa-sistema-alumnos-01" })
      ).headers.get("location"),
    ).toContain("notice=invalid");
    expect(
      (await submit({ ...fields, role: "admin" })).headers.get("location"),
    ).toContain("notice=invalid");
    expect((await submit(fields, "https://otro.example")).status).toBe(403);
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("no crea Auth si la institución no está activa", async () => {
    mocks.organization.mockResolvedValue({ data: null, error: null });
    expect((await submit()).headers.get("location")).toContain(
      "notice=unavailable",
    );
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("crea Auth marcado, vincula por UUID y dirige al login con destino al Dashboard", async () => {
    const response = await submit({ ...fields, email: email.toUpperCase() });
    const location = new URL(response.headers.get("location")!);
    expect(response.status).toBe(303);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/o/incubadora/dashboard");
    expect(mocks.createUser).toHaveBeenCalledExactlyOnceWith({
      email,
      password: fields.password,
      email_confirm: true,
      app_metadata: { student_registration_organization: slug },
    });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "provision_registered_student",
      {
        p_auth_user_id: identity.id,
        p_organization_slug: slug,
        p_email: email,
        p_first_name: "Ana",
        p_last_name: "Muñoz",
      },
    );
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("un fallo de vinculación mantiene el alta pendiente y permite reintentar con la misma identidad", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: new Error("internal"),
    });
    expect((await submit()).headers.get("location")).toContain(
      "notice=unavailable",
    );
    duplicate();
    mocks.signIn.mockResolvedValue({ data: { user: identity }, error: null });
    expect((await submit()).headers.get("location")).toContain(
      "notice=student_registered",
    );
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls[1]?.[1].p_auth_user_id).toBe(identity.id);
  });

  it("un duplicado ajeno o una contraseña incorrecta jamás vinculan la cuenta", async () => {
    duplicate();
    mocks.signIn.mockResolvedValueOnce({
      data: { user: { ...identity, app_metadata: {} } },
      error: null,
    });
    mocks.signIn.mockResolvedValueOnce({
      data: { user: null },
      error: { code: "invalid_credentials" },
    });
    const denied = (await submit()).headers.get("location");
    expect(denied).toContain("notice=unavailable");
    expect((await submit()).headers.get("location")).toBe(denied);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

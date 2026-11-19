import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  client: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/auth/access.server", () => ({
  organizationAccess: mocks.access,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.client,
}));
vi.mock("@/features/academic/shell", () => ({
  AcademicShell: ({ children }: { children: ReactNode }) =>
    createElement("main", null, children),
}));
vi.mock("@/features/auth/components/protected-module", () => ({
  ProtectedModule: () => createElement("p", null, "Acceso restringido"),
}));

import { StudentAccessManagement } from "@/features/auth/student-access-management";
import { studentAccessManagementPost } from "@/features/auth/student-access-management.server";
import { studentAccessDigest } from "@/features/auth/student-registration.server";

const origin = "http://127.0.0.1:3000";
const org = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const action = "/o/impulso-cero/admin/autorizaciones-alumnos/acciones";
const fields = {
  action: "enroll",
  recipient: "inscripcion-2026-001",
  evidence: "verificacion-2026-001",
  verified: "yes",
};
const request = (body: Record<string, string>, source = origin) =>
  new Request(origin + action, {
    method: "POST",
    headers: { origin: source },
    body: new URLSearchParams(body),
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
  vi.stubEnv("AUTH_FLOW_SECRET", "SYNTHETIC-LOCAL-TEST-SECRET".repeat(3));
  mocks.access.mockResolvedValue({
    allowed: true,
    membership: { organizationId: org, name: "Impulso Cero" },
  });
  mocks.client.mockResolvedValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("autorizaciones de alumnos: interfaz y comprobación institucional", () => {
  it("explica la emisión y entrega privada sin presentar alumnos registrados como un padrón", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const html = renderToStaticMarkup(
      await StudentAccessManagement({ slug: "impulso-cero" }),
    );
    expect(html).toContain("Generar un código");
    expect(html).toContain("inscripcion-2026-001");
    expect(html).toContain("24 horas");
    expect(html).toContain("15 minutos");
    expect(html).toContain("canal privado ya confirmado");
    expect(html).toContain('aria-describedby="student-recipient-help"');
    expect(html).toMatch(
      /<label[^>]*><input(?=[^>]*name="verified")(?=[^>]*required)[^>]*\/><span>/,
    );
    expect(html).not.toMatch(/<select[^>]*name="recipient"/);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("list_student_access", {
      p_org: org,
    });
  });

  it("conserva la confirmación obligatoria al reemitir y muestra un ejemplo de nueva comprobación", async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          id,
          recipient_ref: fields.recipient,
          purpose: "enroll",
          status: "expired",
        },
      ],
      error: null,
    });
    const html = renderToStaticMarkup(
      await StudentAccessManagement({ slug: "impulso-cero" }),
    );
    expect(html).toContain("verificacion-2026-002");
    expect(html).toMatch(
      /<label[^>]*><input(?=[^>]*name="verified")(?=[^>]*required)[^>]*\/><span>Volví/,
    );
  });

  it("rechaza la emisión si falta la comprobación institucional", async () => {
    const { verified, ...unverified } = fields;
    expect(verified).toBe("yes");
    const response = await studentAccessManagementPost(
      request(unverified),
      "impulso-cero",
    );
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("conserva la guarda de organización, permiso administrativo y origen", async () => {
    const foreignOrigin = await studentAccessManagementPost(
      request(fields, "https://other.example"),
      "impulso-cero",
    );
    expect(foreignOrigin.status).toBe(403);
    expect(mocks.access).not.toHaveBeenCalled();
    mocks.access.mockResolvedValue({ allowed: false });
    const denied = await studentAccessManagementPost(
      request(fields),
      "impulso-cero",
    );
    expect(denied.status).toBe(403);
    expect(mocks.access).toHaveBeenCalledWith(
      "impulso-cero",
      "admin",
      "student_access",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("entrega las dos pruebas solo en respuesta privada y envía sus hashes a la RPC", async () => {
    const response = await studentAccessManagementPost(
      request(fields),
      "impulso-cero",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    const html = await response.text();
    expect(html).toContain("una sola vez");
    expect(html).toContain("Envía la prueba por separado");
    const secrets = [...html.matchAll(/<code>([^<]+)<\/code>/g)].map(
      (match) => match[1]!,
    );
    expect(secrets).toHaveLength(2);
    const [authorizationId, code] = secrets[0]!.split(".");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("issue_student_access", {
      p_org: org,
      p_id: authorizationId,
      p_evidence: fields.evidence,
      p_purpose: "enroll",
      p_recipient: fields.recipient,
      p_code: studentAccessDigest(code!),
      p_proof: studentAccessDigest(secrets[1]!),
    });
  });
});

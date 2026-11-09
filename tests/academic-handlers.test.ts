import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  create: vi.fn(),
  mutate: vi.fn(),
  pdf: vi.fn(),
}));
vi.mock("@/lib/auth/session.server", () => ({ readSession: mocks.session }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.create,
}));
vi.mock("@/features/academic/data.server", () => ({
  mutateAcademic: mocks.mutate,
  privatePdf: mocks.pdf,
}));
import { academicPost, academicPdf } from "@/features/academic/handlers.server";
import { NextRequest } from "next/server";
import { GET as scheduleGet } from "@/app/(workspace)/o/[organizationSlug]/horario/datos/route";
import type { AuthenticatedSession } from "@/lib/auth/resolve";
const org = "11111111-1111-4111-8111-111111111111",
  id = "22222222-2222-4222-8222-222222222222",
  origin = "http://127.0.0.1:3000";
function session(): AuthenticatedSession {
  return {
    status: "authenticated",
    user: { id: "auth-a" },
    identity: {
      profileId: "profile-a",
      authUserId: "auth-a",
      status: "active",
      assuranceLevel: "aal2",
    },
    memberships: [
      {
        organizationId: org,
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
const request = (headers: Record<string, string> = {}) =>
  new Request(origin + "/o/qa/acciones", {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/x-www-form-urlencoded",
      ...headers,
    },
    body: new URLSearchParams({
      action: "course",
      slug: "qa",
      title: "Taller",
      status: "draft",
      organization_id: id,
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.session.mockResolvedValue(session());
  mocks.create.mockResolvedValue({ synthetic: true });
  mocks.mutate.mockResolvedValue(undefined);
  mocks.pdf.mockResolvedValue({
    blob: new Blob(["synthetic pdf"]),
    name: "guia.pdf",
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("acciones académicas: guard real con sesión simulada", () => {
  it("admin aal2 usa organización verificada, nunca la del formulario", async () => {
    const r = await academicPost(request(), "qa");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(
      origin + "/o/qa/admin/cursos?notice=saved",
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      { synthetic: true },
      org,
      expect.objectContaining({ kind: "course" }),
    );
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["aal1", "student", "suspended", "blocked", "other-org"])(
    "rechaza %s sin mutaciones ni cliente de datos",
    async (kind) => {
      const s = session();
      if (kind === "aal1")
        s.identity = { ...s.identity!, assuranceLevel: "aal1" };
      if (kind === "student")
        s.memberships[0] = { ...s.memberships[0]!, role: "student" };
      if (kind === "suspended")
        s.memberships[0] = {
          ...s.memberships[0]!,
          organizationStatus: "suspended",
        };
      if (kind === "blocked")
        s.identity = { ...s.identity!, status: "blocked" };
      mocks.session.mockResolvedValue(s);
      const r = await academicPost(
        request(),
        kind === "other-org" ? "otra" : "qa",
      );
      expect(r.status).toBe(403);
      expect(mocks.mutate).not.toHaveBeenCalled();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it("sin sesión deniega antes de mutar", async () => {
    mocks.session.mockResolvedValue({ status: "anonymous", user: null });
    expect((await academicPost(request(), "qa")).status).toBe(401);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("Auth false no permite operaciones reales", async () => {
    vi.stubEnv("SUPABASE_AUTH_ENABLED", "false");
    expect((await academicPost(request(), "qa")).status).toBe(503);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each([
    { origin: "https://evil.test" },
    { "sec-fetch-site": "cross-site" },
  ])("CSRF se rechaza antes de consultar sesión", async (headers) => {
    expect((await academicPost(request(headers), "qa")).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("campos inválidos no llegan al adaptador", async () => {
    const req = new Request(origin + "/o/qa/acciones", {
      method: "POST",
      headers: { origin, "content-type": "application/x-www-form-urlencoded" },
      body: "action=course&title=",
    });
    const r = await academicPost(req, "qa");
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toContain("notice=invalid");
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it.each([
    ["23505", "duplicate"],
    ["40001", "conflict"],
    ["42501", "unavailable"],
  ])("error %s se muestra sin detalles privados", async (code, notice) => {
    mocks.mutate.mockRejectedValueOnce({ code, message: "PRIVATE_SQL_DETAIL" });
    const r = await academicPost(request(), "qa");
    expect(r.headers.get("location")).toContain("notice=" + notice);
    expect(await r.text()).not.toContain("PRIVATE_SQL_DETAIL");
  });
  it("PDF del alumno usa sesión y respuesta privada, sin URL pública", async () => {
    const s = session();
    s.identity = { ...s.identity!, assuranceLevel: "aal1" };
    s.memberships[0] = { ...s.memberships[0]!, role: "student" };
    mocks.session.mockResolvedValue(s);
    const r = await academicPdf("qa", id);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(mocks.pdf).toHaveBeenCalledWith({ synthetic: true }, org, id);
  });
  it("PDF administrativo también exige aal2", async () => {
    const s = session();
    s.identity = { ...s.identity!, assuranceLevel: "aal1" };
    mocks.session.mockResolvedValue(s);
    expect((await academicPdf("qa", id)).status).toBe(403);
    expect(mocks.pdf).not.toHaveBeenCalled();
  });
  it("PDF ajeno o no disponible no expone metadatos", async () => {
    expect((await academicPdf("otra", id)).status).toBe(403);
    mocks.pdf.mockRejectedValueOnce(Error("PRIVATE_DETAIL"));
    const r = await academicPdf("qa", id);
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain("PRIVATE_DETAIL");
  });
});

describe("Horario: guardas HTTP y RPC", () => {
  const schedulePost = (headers: Record<string, string> = {}) =>
    new Request(origin + "/o/qa/acciones", {
      method: "POST",
      headers: { origin, ...headers },
      body: new URLSearchParams({
        action: "schedule-create",
        organization_id: id,
        course: id,
        title: "Clase de prueba",
        date: "2026-11-09",
        start: "09:00",
        end: "10:00",
        repeat: "weekly",
        until: "2026-11-23",
        weekday: "1",
      }),
    });
  const get = (scope: string) =>
    scheduleGet(
      new NextRequest(
        origin + "/o/qa/horario/datos?date=2026-11-09&scope=" + scope,
      ),
      {
        params: Promise.resolve({ organizationSlug: "qa" }),
      },
    );
  it("envía la serie completa a una sola RPC de la organización verificada", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null, data: [] });
    mocks.create.mockResolvedValue({ rpc });
    const response = await academicPost(schedulePost(), "qa");
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(
      "create_schedule_sessions",
      expect.objectContaining({
        p_org: org,
        p_dates: ["2026-11-09", "2026-11-16", "2026-11-23"],
      }),
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("bloquea el POST con Origin externo antes de llamar a la RPC", async () => {
    const response = await academicPost(
      schedulePost({ origin: "https://invalid.example" }),
      "qa",
    );
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("devuelve conflicto privado y sin detalles SQL ante un solapamiento", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({
        error: { code: "23P01", details: "detalle interno" },
      });
    mocks.create.mockResolvedValue({ rpc });
    const response = await academicPost(schedulePost(), "qa");
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain("detalle interno");
  });
  it("rechaza alcance administrativo para admin aal1 y para un alumno", async () => {
    const s = session();
    s.identity = { ...s.identity!, assuranceLevel: "aal1" };
    mocks.session.mockResolvedValue(s);
    expect((await get("admin")).status).toBe(403);
    expect((await academicPost(schedulePost(), "qa")).status).toBe(403);
    s.memberships[0] = { ...s.memberships[0]!, role: "student" };
    expect((await get("admin")).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("consulta el rango del alumno con la organización verificada y sin caché", async () => {
    const s = session();
    s.memberships[0] = { ...s.memberships[0]!, role: "student" };
    mocks.session.mockResolvedValue(s);
    const rpc = vi
      .fn()
      .mockResolvedValue({ error: null, data: { courses: [], sessions: [] } });
    mocks.create.mockResolvedValue({ rpc });
    const response = await get("");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("list_schedule", {
      p_org: org,
      p_from: "2026-11-09",
      p_to: "2026-11-16",
      p_admin: false,
      p_course: "",
    });
  });
});

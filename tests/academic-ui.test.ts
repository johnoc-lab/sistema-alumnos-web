import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  load: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/auth/access.server", () => ({
  organizationAccess: mocks.access,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.create,
}));
vi.mock("@/features/academic/data.server", () => ({
  loadAcademic: mocks.load,
}));
import { AcademicView, AcademicPage } from "@/features/academic/academic-page";
import { ProtectedModule } from "@/features/auth/components/protected-module";
import type { AcademicData } from "@/features/academic/data.server";
const empty = (): AcademicData => ({
  courses: [],
  memberships: [],
  enrollments: [],
  materials: [],
  announcements: [],
  events: [],
  files: [],
});
const render = (section: string, data = empty(), search = {}) =>
  renderToStaticMarkup(
    createElement(AcademicView, {
      slug: "qa",
      section,
      data,
      profileId: "profile-a",
      search,
    }),
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ mock: true });
});
describe("vistas académicas", () => {
  it.each([
    ["dashboard/cursos", "No tienes talleres"],
    ["dashboard/materiales", "No hay materiales"],
    ["dashboard/avisos", "No hay avisos"],
    ["dashboard/calendario", "No hay actividades"],
  ])("estado vacío de %s sin acciones de administración", (section, text) => {
    const html = render(section!);
    expect(html).toContain(text);
    expect(html).not.toContain("/acciones");
    expect(html).not.toContain("action=");
  });
  it("talleres administrativos ofrecen creación POST y estados reales", () => {
    const html = render("admin/cursos");
    expect(html).toContain('action="/o/qa/acciones"');
    expect(html).toContain('method="post"');
    expect(html).toContain("Crear taller");
    expect(html).not.toContain("ficticio");
  });
  it("gestión de alumnos no simula crear credenciales", () => {
    expect(render("admin/alumnos")).toContain(
      "procedimiento administrativo pendiente",
    );
  });
  it("matrículas explican conservación de registros y deshabilitan alta vacía", () => {
    const html = render("admin/matriculas");
    expect(html).toContain("no se reemplaza ni se elimina");
    expect(html).toContain("disabled");
  });
  it("no mezcla búsqueda sin coincidencias con datos ajenos", () => {
    const data = empty();
    data.courses = [
      {
        id: "course-a",
        title: "Emprendimiento",
        description: "Texto",
        tag: "QA",
        slug: "qa",
        status: "published",
        row_version: 1,
      } as AcademicData["courses"][number],
    ];
    const html = render("admin/cursos", data, { q: "otro" });
    expect(html).toContain("No hay talleres que coincidan");
    expect(html).not.toContain("<h2>Emprendimiento</h2>");
  });
  it("aviso escapa HTML y material no convierte javascript en un enlace", () => {
    const data = empty();
    data.announcements = [
      {
        id: "notice-a",
        title: "QA",
        body: "<script>alert(1)</script>",
        course_id: "course-a",
        published_at: null,
      } as AcademicData["announcements"][number],
    ];
    expect(render("dashboard/avisos", data)).toContain("&lt;script&gt;");
    expect(render("dashboard/avisos", data)).not.toContain("<script>");
    data.materials = [
      {
        id: "m-a",
        title: "QA",
        course_id: "course-a",
        external_url: "javascript:alert(1)",
        file_asset_id: null,
      } as AcademicData["materials"][number],
    ];
    expect(render("dashboard/materiales", data)).not.toContain(
      'href="javascript:',
    );
  });
  it("PDF tiene descarga privada del workspace y no enlace público Storage", () => {
    const data = empty();
    data.materials = [
      {
        id: "m-a",
        title: "PDF",
        course_id: "course-a",
        file_asset_id: "asset-a",
        external_url: null,
      } as AcademicData["materials"][number],
    ];
    const html = render("dashboard/materiales", data);
    expect(html).toContain("/o/qa/archivos/asset-a");
    expect(html).not.toContain("/storage/v1/object/public");
  });
  it("PDF administrativo informa que la subida no está habilitada", () =>
    expect(render("admin/materiales")).toContain(
      "subirlos requiere habilitar",
    ));
  it("guard denegado no consulta datos académicos", async () => {
    mocks.access.mockResolvedValue({
      allowed: false,
      reason: "mfa_required",
      session: { status: "authenticated" },
    });
    const page = await AcademicPage({ slug: "qa", section: "admin/cursos" });
    expect(page.type).toBe(ProtectedModule);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("fallo de consulta presenta error, nunca una lista vacía simulada", async () => {
    mocks.access.mockResolvedValue({
      allowed: true,
      membership: { organizationId: "org-a", name: "QA" },
      session: {
        status: "authenticated",
        identity: { profileId: "profile-a" },
      },
    });
    mocks.load.mockRejectedValue(Error("PRIVATE_DB_DETAIL"));
    const page = await AcademicPage({
      slug: "qa",
      section: "dashboard/cursos",
    });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("No se pudo consultar la información");
    expect(html).not.toContain("PRIVATE_DB_DETAIL");
    expect(html).not.toContain("No tienes talleres disponibles");
  });
});

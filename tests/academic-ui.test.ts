import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  load: vi.fn(),
  create: vi.fn(),
  registrationEnabled: vi.fn(),
}));
vi.mock("@/lib/auth/access.server", () => ({
  organizationAccess: mocks.access,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.create,
}));
vi.mock("@/lib/supabase/staff-admin.server", () => ({
  staffRegistrationEnabled: mocks.registrationEnabled,
}));
vi.mock("@/features/academic/data.server", () => ({
  loadAcademic: mocks.load,
}));
import { StaffPage } from "@/features/staff/staff-page";
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
  attendance: [],
  attendanceAvailable: true,
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
  mocks.registrationEnabled.mockReturnValue(false);
});
describe("vistas académicas", () => {
  it.each([
    ["dashboard/cursos", "No tienes talleres"],
    ["dashboard/materiales", "No hay materiales"],
    ["dashboard/avisos", "No hay avisos"],
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
      membership: {
        organizationId: "org-a",
        name: "QA",
        staffRank: "principal",
        allowedModules: [],
      },
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

describe("recorrido y presentación académica", () => {
  const course = "11111111-1111-4111-8111-111111111111";
  function sample() {
    const data = empty();
    data.courses = [
      {
        id: course,
        title: "Taller QA",
        slug: "qa",
        tag: "QA",
        status: "published",
        description: "Texto",
        row_version: 1,
      } as AcademicData["courses"][number],
    ];
    data.memberships = [
      {
        id: "member-a",
        profile_id: "profile-a",
        role: "student",
        status: "active",
        first_name: "Alumno",
        last_name: "QA",
        joined_at: "2026-11-01T00:00:00Z",
        row_version: 1,
      } as AcademicData["memberships"][number],
    ];
    data.enrollments = [
      {
        id: "enrollment-a",
        course_id: course,
        membership_id: "member-a",
        status: "active",
        progress_percent: 25,
        enrolled_at: "2026-11-01T00:00:00Z",
        row_version: 1,
      } as AcademicData["enrollments"][number],
    ];
    return data;
  }
  it("enlace desde taller preselecciona el mismo taller para matricular", () => {
    const html = render("admin/matriculas", sample(), { course });
    expect(html).toContain('value="' + course + '" selected=""');
    expect(html).toContain("<table");
    expect(html).toContain("25%");
    expect(html).toContain('name="version" value="1"');
  });
  it("identificador ajeno no se incorpora a la selección del formulario", () => {
    const html = render("admin/matriculas", sample(), {
      course: "no-es-un-taller",
    });
    expect(html).toContain('value="" disabled="" selected=""');
    expect(html).not.toContain('value="no-es-un-taller"');
  });
  it("tabla de alumnos conserva edición POST y control de versión", () => {
    const html = render("admin/alumnos", sample());
    expect(html).toContain("<table");
    expect(html).toContain("<caption>Alumnos de la organización</caption>");
    expect(html).toContain('value="student-status"');
    expect(html).toContain('name="version" value="1"');
  });
  it("resumen ofrece los cuatro pasos del recorrido y navegación accesible", async () => {
    const html = render("admin", sample());
    for (const path of ["cursos", "matriculas", "materiales", "avisos"])
      expect(html).toContain("/o/qa/admin/" + path);
    mocks.access.mockResolvedValue({
      allowed: true,
      membership: {
        organizationId: "org-a",
        name: "QA",
        staffRank: "principal",
        allowedModules: [],
      },
      session: {
        status: "authenticated",
        identity: { profileId: "profile-a" },
      },
    });
    mocks.load.mockResolvedValue(sample());
    const page = renderToStaticMarkup(
      await AcademicPage({
        slug: "qa",
        section: "admin/matriculas",
        search: { notice: "saved" },
      }),
    );
    expect(page).toContain('aria-current="page"');
    expect(page).toContain('role="status"');
    expect(page).toContain("Cambios guardados.");
  });
  it("errores se muestran como alerta sin imprimir mensajes del proveedor", async () => {
    mocks.access.mockResolvedValue({
      allowed: true,
      membership: {
        organizationId: "org-a",
        name: "QA",
        staffRank: "principal",
        allowedModules: [],
      },
      session: {
        status: "authenticated",
        identity: { profileId: "profile-a" },
      },
    });
    mocks.load.mockResolvedValue(sample());
    const html = renderToStaticMarkup(
      await AcademicPage({
        slug: "qa",
        section: "admin/matriculas",
        search: { notice: "duplicate" },
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Ya existe ese taller o matrícula");
  });
});

describe("vista de Administradores y navegación delegada", () => {
  const member = {
    organizationId: "org-a",
    name: "QA",
    staffRank: "principal",
    allowedModules: [],
  };
  const grant = (membership = member) =>
    mocks.access.mockResolvedValue({
      allowed: true,
      membership,
      session: {
        status: "authenticated",
        identity: { profileId: "profile-a" },
      },
    });
  it("la lista de personal se consulta solo para el principal y permite filtrar", async () => {
    grant();
    const rpc = vi.fn().mockResolvedValue({
      error: null,
      data: {
        pending: [
          {
            id: "assignment",
            name: "Cuenta nueva",
            identifier: "u-nueva@cuentas.sistema-alumnos.invalid",
          },
        ],
        staff: [
          {
            id: "admin",
            name: "Principal QA",
            identifier: "u-qa",
            rank: "principal",
            status: "active",
            self: true,
            modules: [],
            version: 1,
          },
          {
            id: "secretary",
            name: "Secretaría <QA>",
            identifier: "u-s",
            rank: "secretary",
            status: "suspended",
            self: false,
            modules: ["enrollments"],
            version: 2,
          },
        ],
      },
    });
    mocks.create.mockResolvedValue({ rpc });
    const page = renderToStaticMarkup(
      await StaffPage({
        slug: "qa",
        search: { q: "secretaria", status: "suspended", notice: "stale" },
      }),
    );
    expect(mocks.access).toHaveBeenCalledExactlyOnceWith(
      "qa",
      "admin",
      "staff.manage",
    );
    expect(rpc).toHaveBeenCalledExactlyOnceWith("list_staff", {
      p_org: "org-a",
    });
    expect(page).toContain("Secretaría &lt;QA&gt;");
    expect(page).not.toContain("Principal QA");
    expect(page).toContain("Cuenta nueva");
    expect(page).toContain('value="2"');
    expect(page).toContain("Activar");
    expect(page).toContain('role="alert"');
  });
  it("mantiene el control nativo de alta y presenta las cuentas pendientes", async () => {
    grant();
    mocks.registrationEnabled.mockReturnValue(true);
    mocks.create.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({
        data: {
          pending: [],
          staff: [
            {
              id: "member",
              name: "Docente nuevo",
              identifier: "u-docente@cuentas.sistema-alumnos.invalid",
              rank: "teacher",
              status: "invited",
              modules: ["attendance"],
              version: 1,
              self: false,
              registration: "registration",
            },
          ],
        },
      }),
    });
    const html = renderToStaticMarkup(
      await StaffPage({ slug: "qa", search: {} }),
    );
    expect(html).toMatch(
      /<details[^>]+><summary[^>]+>Agregar personal<\/summary>/,
    );
    expect(html).toContain('value="register"');
    expect(html).toContain('name="assignment"');
    const form = html.match(
      /<form[^>]*>[^]*?value="register"[^]*?<\/form>/,
    )?.[0];
    expect(form).toBeDefined();
    expect(form).not.toContain('value="principal"');
    expect(form).not.toContain('value="certificates"');
    expect(html).toContain("Pendiente de activación");
    expect(html).toContain("Preparar nuevo código");
    expect(html).toContain("Cancelar alta pendiente");
  });

  it("el rechazo de Administradores no construye cliente de datos", async () => {
    mocks.access.mockResolvedValue({
      allowed: false,
      reason: "module_required",
      session: { status: "authenticated" },
    });
    expect((await StaffPage({ slug: "qa", search: {} })).type).toBe(
      ProtectedModule,
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("la navegación delegada solo enlaza los módulos asignados", async () => {
    grant({
      ...member,
      staffRank: "secretary",
      allowedModules: ["enrollments"],
    } as typeof member);
    const html = renderToStaticMarkup(
      await AcademicPage({ slug: "qa", section: "admin" }),
    );
    expect(html).toContain("/o/qa/admin/matriculas");
    expect(html).not.toContain("/o/qa/admin/alumnos");
    expect(html).not.toContain("/o/qa/admin/administradores");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

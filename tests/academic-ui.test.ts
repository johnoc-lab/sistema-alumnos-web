import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  load: vi.fn(),
  nextSession: vi.fn(),
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
  loadNextStudentSession: mocks.nextSession,
}));
import { StaffPage } from "@/features/staff/staff-page";
import ActivationPage from "@/app/auth/activar-personal/page";
import { staffIdentifierPattern } from "@/features/staff/identifier";
import { AcademicView, AcademicPage } from "@/features/academic/academic-page";
import { ProtectedModule } from "@/features/auth/components/protected-module";
import type { AcademicData } from "@/features/academic/data.server";
import type { StaffPermission } from "@/lib/authorization/staff";
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
  mocks.nextSession.mockResolvedValue(null);
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
  it("materiales separa los enlaces de clase para los estudiantes", () => {
    const html = render("admin/materiales");
    expect(html).toContain("Clase en vivo");
    expect(html).toContain("Clase grabada");
    expect(html).toContain("Videos de ayuda");
    expect(html).toContain("PDF del taller");
  });
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

describe("portada del alumno", () => {
  it.each([true, false])(
    "muestra una tarjeta independiente de MFA con estado %s",
    (totpEnabled) => {
      const html = renderToStaticMarkup(
        createElement(AcademicView, {
          slug: "qa",
          section: "dashboard/perfil",
          data: empty(),
          profileId: "profile-a",
          totpEnabled,
        }),
      );
      expect(html).toMatch(
        /<\/section><section[^>]*aria-labelledby="profile-mfa-title"/,
      );
      expect(html).toContain(totpEnabled ? "Activada" : "Desactivada");
      expect(html).toContain("Gestionar verificación en dos pasos");
      expect(html).toContain("/auth/mfa?next=%2Fo%2Fqa%2Fdashboard%2Fperfil");
    },
  );
  const courseId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";
  const membership = { name: "QA", organizationId: "org-a", profileId: "profile-a", role: "student" };
  function studentData() {
    const data = empty();
    data.memberships = [
      { id: "member-a", profile_id: "profile-a", role: "student", first_name: "Ana" } as AcademicData["memberships"][number],
    ];
    data.courses = [
      { id: otherId, title: "Taller terminado", status: "published" },
      { id: courseId, title: "Taller activo", status: "published" },
    ];
    data.enrollments = [
      { course_id: otherId, membership_id: "member-a", status: "completed", progress_percent: null },
      { course_id: courseId, membership_id: "member-a", status: "active", progress_percent: 0 },
    ] as AcademicData["enrollments"];
    return data;
  }
  beforeEach(() => {
    mocks.access.mockResolvedValue({
      allowed: true,
      membership,
      session: { status: "authenticated", identity: { profileId: "profile-a" } },
    });
    mocks.load.mockResolvedValue(studentData());
  });
  it("muestra la próxima sesión en hora peruana y enlaza al día local de su taller", async () => {
    mocks.nextSession.mockResolvedValue({
      title: "Sesión de práctica",
      course_id: courseId,
      course: { title: "Taller activo" },
      starts_at: "2026-11-17T01:30:00Z",
      ends_at: "2026-11-17T02:30:00Z",
    });
    const html = renderToStaticMarkup(await AcademicPage({ slug: "qa", section: "dashboard" }));
    expect(mocks.nextSession).toHaveBeenCalledWith({ mock: true }, "org-a", "member-a");
    expect(html).toContain("Sesión de práctica");
    expect(html).toContain("20:30");
    expect(html).toContain("21:30");
    expect(html).toContain("Hora de Perú");
    expect(html).toContain("/dashboard/horario?course=" + courseId + "&amp;date=2026-11-16");
  });
  it("distingue entre agenda sin próximas sesiones y consulta no disponible", async () => {
    const html = renderToStaticMarkup(await AcademicPage({ slug: "qa", section: "dashboard" }));
    expect(html).toContain("No tienes sesiones próximas programadas.");
    mocks.nextSession.mockRejectedValueOnce(Error("PRIVATE_DB_DETAIL"));
    const failed = renderToStaticMarkup(await AcademicPage({ slug: "qa", section: "dashboard" }));
    expect(failed).toContain("No se pudo consultar tu próxima sesión.");
    expect(failed).toContain("Taller activo");
    expect(failed).not.toContain("PRIVATE_DB_DETAIL");
  });
  it("ordena matrículas activas y mantiene un acceso por tarjeta", () => {
    const html = render("dashboard", studentData());
    expect(html.indexOf("Taller activo")).toBeLessThan(html.indexOf("Taller terminado"));
    expect(html).toContain("0% completado");
    expect(html).toContain("Sin avance registrado");
    expect(html.match(new RegExp('href="/o/qa/dashboard/cursos/' + courseId + '"', "g"))).toHaveLength(1);
    expect(html).toContain('href="/o/qa/dashboard/horario"');
    expect(html).toContain('href="/o/qa/dashboard/asistencia"');
    expect(html).toContain('href="/o/qa/dashboard/certificados"');
  });
  it("mantiene Mis talleres destacado en el detalle y no convierte avance ausente en cero", async () => {
    const html = renderToStaticMarkup(await AcademicPage({ slug: "qa", section: "dashboard/cursos", courseId: otherId }));
    expect(html).toMatch(/<a[^>]*href="\/o\/qa\/dashboard\/cursos"[^>]*aria-current="page"|<a[^>]*aria-current="page"[^>]*href="\/o\/qa\/dashboard\/cursos"/);
    expect(html).toContain("Sin avance registrado");
    expect(html).not.toContain("Avance: 0%");
    expect(mocks.nextSession).not.toHaveBeenCalled();
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
    allowedModules: [] as StaffPermission[],
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
  it("muestra la institución de alta y conserva el formulario y sus estados", async () => {
    grant({ ...member, name: "Impulso Cero" });
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
      await StaffPage({ slug: "impulso-cero", search: {} }),
    );
    expect(html).toMatch(
      /<details[^>]+><summary[^>]+>Agregar personal<\/summary>/,
    );
    expect(html).toContain('value="register"');
    expect(html).toContain('name="assignment"');
    const form = html.match(
      /<form[^>]*>[^]*?value="register"[^]*?<\/form>/,
    )?.[0];
    expect(html).toContain("Institución asignada: Impulso Cero");
    expect(form).toContain('action="/o/impulso-cero/admin/administradores/acciones"');
    expect(form).not.toMatch(/name="(?:organization|organization_id|slug)"/);
    expect(form).toContain('pattern="' + staffIdentifierPattern + '"');
    expect(form).toContain('aria-describedby="staff-identifier-help"');
    expect(form).not.toContain('value="principal"');
    expect(form).not.toContain('value="certificates"');
    expect(html).toContain("Pendiente de activación");
    expect(html).toContain("Preparar nuevo código");
    expect(html).toContain("Cancelar alta pendiente");
  });

  it("la activación asocia el formato institucional con el campo", async () => {
    mocks.registrationEnabled.mockReturnValue(true);
    const page = renderToStaticMarkup(
      await ActivationPage({
        searchParams: Promise.resolve({ notice: "invalid_identifier" }),
      }),
    );
    expect(page).toContain('pattern="' + staffIdentifierPattern + '"');
    expect(page).toContain('aria-describedby="activation-identifier-help"');
    expect(page).toContain('role="alert"');
    expect(page).toContain("u-profesor01@cuentas.sistema-alumnos.invalid");
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
  it.each([
    ["impulso-cero", "Impulso Cero", true],
    ["incubadora", "Incubadora", false],
    ["qa-sistema-alumnos-01", "QA Sistema Alumnos", false],
  ])("muestra tarjetas del profesor en %s con la identidad de su institución", async (slug, name, branded) => {
    grant({
      ...member,
      name,
      staffRank: "teacher",
      allowedModules: ["attendance", "certificates", "certificates.recommend"],
    });
    const html = renderToStaticMarkup(await AcademicPage({ slug, section: "admin" }));
    const cards = html.match(/<ul aria-label="Módulos autorizados"[^>]*>[^]*?<\/ul>/)?.[0];
    expect(cards?.match(/<li>/g)).toHaveLength(2);
    expect(cards).toContain('href="/o/' + slug + '/admin/asistencia"');
    expect(cards).toContain('href="/o/' + slug + '/admin/certificados"');
    expect(cards).toContain("<svg");
    expect(html).not.toContain("/admin/alumnos");
    expect(html).not.toContain("/admin/administradores");
    expect(html).toContain("<p>" + name + "</p>");
    expect(html.includes("/brands/impulso-cero-lockup.png")).toBe(branded);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("un profesor sin módulos ve un estado vacío sin tarjetas", async () => {
    grant({ ...member, staffRank: "teacher" });
    const html = renderToStaticMarkup(
      await AcademicPage({ slug: "qa", section: "admin" }),
    );
    expect(html).toContain("No tienes secciones asignadas.");
    expect(html).not.toContain('aria-label="Módulos autorizados"');
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

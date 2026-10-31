import { notFound } from "next/navigation";
import { Video, MessageSquare, FolderOpen, Award } from "lucide-react";
import { PreviewShell } from "@/components/layouts/preview-shell";
import { EmptyFeature, PageHeading, Badge } from "@/components/ui/primitives";
import { StudentDashboard } from "@/features/dashboard/components/student-dashboard";
import { CourseCatalog } from "@/features/courses/components/course-catalog";
import { CourseDetail } from "@/features/courses/components/course-detail";
import { CourseManagement } from "@/features/courses/components/course-management";
import { StudentManagement } from "@/features/students/components/student-management";
import { CalendarPlaceholder } from "@/features/calendar/components/calendar-placeholder";
import { AdminOverview } from "@/features/admin/components/admin-overview";
import { getPreviewData } from "./fixtures";
import type { PreviewRoute } from "./routes";
import styles from "@/features/dashboard/components/dashboard.module.css";
import ui from "@/components/ui/ui.module.css";
export function RenderPreview({ route }: { route: PreviewRoute }) {
  const data = getPreviewData(route.organizationSlug);
  let content: React.ReactNode;
  if (route.courseId) {
    const course = data.courses.find(
      (c) => c.id === route.courseId && c.status === "published",
    );
    if (!course) notFound();
    content = <CourseDetail course={course} />;
  } else {
    switch (route.section) {
      case "dashboard":
        content = (
          <StudentDashboard organizationSlug={route.organizationSlug} />
        );
        break;
      case "dashboard/cursos":
        content = <CourseCatalog courses={data.courses} />;
        break;
      case "dashboard/calendario":
        content = <CalendarPlaceholder />;
        break;
      case "dashboard/perfil":
        content = (
          <>
            <PageHeading
              eyebrow="MI ESPACIO"
              title="Mi perfil"
              description="Una ficha de ejemplo, sin una identidad autenticada."
            />
            <section className={ui.panel + " " + styles.profile}>
              <Badge tone="amber">Perfil ficticio</Badge>
              <strong>{data.studentName} · Alumna de ejemplo</strong>
              <dl>
                <dt>Organización ilustrativa</dt>
                <dd>{data.organization.name}</dd>
                <dt>Sesión real</dt>
                <dd>No iniciada</dd>
                <dt>Edición de datos</dt>
                <dd>No habilitada</dd>
              </dl>
            </section>
          </>
        );
        break;
      case "admin":
        content = <AdminOverview organizationSlug={route.organizationSlug} />;
        break;
      case "admin/alumnos":
        content = <StudentManagement students={data.students} />;
        break;
      case "admin/cursos":
        content = <CourseManagement courses={data.courses} />;
        break;
      case "admin/calendario":
        content = <CalendarPlaceholder admin />;
        break;
      case "admin/clases":
        content = (
          <>
            <PageHeading
              eyebrow="CONTENIDO · ADMINISTRACIÓN"
              title="Clases"
              description="Estructura inicial para organizar las clases de cada taller."
            />
            <EmptyFeature
              title="Cada clase, en su lugar"
              description="La gestión de módulos, videos y sesiones se incorporará tras integrar las consultas y permisos. No hay edición habilitada."
              icon={Video}
            />
          </>
        );
        break;
      case "admin/avisos":
        content = (
          <>
            <PageHeading
              eyebrow="COMUNICACIÓN · ADMINISTRACIÓN"
              title="Tablón de avisos"
              description="Novedades para las personas que forman parte de cada taller."
            />
            <EmptyFeature
              title="Un espacio para mantener el contacto"
              description="Los avisos reales se publicarán por curso y solo podrán leerse con la matrícula correspondiente."
              icon={MessageSquare}
            />
          </>
        );
        break;
      case "admin/materiales":
        content = (
          <>
            <PageHeading
              eyebrow="RECURSOS · ADMINISTRACIÓN"
              title="Materiales"
              description="Documentos y recursos de apoyo, con acceso por taller."
            />
            <EmptyFeature
              title="Los recursos llegarán aquí"
              description="El almacenamiento todavía no está conectado. No hay cargas ni descargas de archivos reales disponibles."
              icon={FolderOpen}
            />
          </>
        );
        break;
      case "admin/certificados":
        content = (
          <>
            <PageHeading
              eyebrow="RECONOCIMIENTO · ADMINISTRACIÓN"
              title="Certificados"
              description="Un espacio para reconocer el camino recorrido."
            />
            <EmptyFeature
              title="Preparado para los próximos logros"
              description="La plantilla y las exportaciones se adaptarán en una siguiente fase, tras definir la elegibilidad. No hay emisiones ni documentos reales."
              icon={Award}
            />
          </>
        );
        break;
    }
  }
  return (
    <PreviewShell organization={data.organization} section={route.section}>
      {content}
    </PreviewShell>
  );
}

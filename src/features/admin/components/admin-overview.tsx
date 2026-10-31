import Link from "next/link";
import {
  Users,
  BookOpen,
  CalendarDays,
  ArrowRight,
  FolderOpen,
  MessageSquare,
  Award,
  Video,
} from "lucide-react";
import { getPreviewData } from "@/features/preview/fixtures";
import { previewHref, type OrganizationSlug } from "@/features/preview/routes";
import { Badge, PageHeading } from "@/components/ui/primitives";
import styles from "@/features/dashboard/components/dashboard.module.css";
export function AdminOverview({
  organizationSlug,
}: {
  organizationSlug: OrganizationSlug;
}) {
  const data = getPreviewData(organizationSlug);
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRACIÓN · VISTA DE EJEMPLO"
        title="Todo empieza con una buena visión"
        description="Una mirada al aprendizaje y a las personas que lo hacen posible."
        action={<Badge tone="amber">Solo visualización</Badge>}
      />
      <section className={styles.stats} aria-label="Resumen de datos ficticios">
        <div className={styles.stat}>
          <div className={styles.statIcon}>
            <Users size={20} />
          </div>
          <div>
            <strong>{String(data.students.length).padStart(2, "0")}</strong>
            <span>Alumnos de ejemplo</span>
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIcon}>
            <BookOpen size={20} />
          </div>
          <div>
            <strong>
              {String(
                data.courses.filter((c) => c.status === "published").length,
              ).padStart(2, "0")}
            </strong>
            <span>Talleres publicados ficticios</span>
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIcon}>
            <CalendarDays size={20} />
          </div>
          <div>
            <strong>—</strong>
            <span>Calendario por conectar</span>
          </div>
        </div>
      </section>
      <div className={styles.lower}>
        <section className={styles.panel}>
          <div className={styles.sectionHeading}>
            <h2>Personas que avanzan</h2>
            <Link href={previewHref(organizationSlug, "admin/alumnos")}>
              Ver alumnos
              <ArrowRight size={13} />
            </Link>
          </div>
          <div className={styles.list}>
            {data.students.map((student) => (
              <Link
                href={previewHref(organizationSlug, "admin/alumnos")}
                key={student.id}
              >
                <div>
                  <strong>{student.name}</strong>
                  <span>
                    {student.courses}{" "}
                    {student.courses === 1
                      ? "taller ilustrativo"
                      : "talleres ilustrativos"}{" "}
                    · Contacto ficticio
                  </span>
                </div>
                <ArrowRight size={14} />
              </Link>
            ))}
          </div>
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Tu espacio de gestión</h2>
          <div className={styles.quickGrid}>
            <Link href={previewHref(organizationSlug, "admin/cursos")}>
              <BookOpen size={18} />
              Talleres
            </Link>
            <Link href={previewHref(organizationSlug, "admin/clases")}>
              <Video size={18} />
              Clases
            </Link>
            <Link href={previewHref(organizationSlug, "admin/avisos")}>
              <MessageSquare size={18} />
              Avisos
            </Link>
            <Link href={previewHref(organizationSlug, "admin/materiales")}>
              <FolderOpen size={18} />
              Materiales
            </Link>
            <Link href={previewHref(organizationSlug, "admin/calendario")}>
              <CalendarDays size={18} />
              Calendario
            </Link>
            <Link href={previewHref(organizationSlug, "admin/certificados")}>
              <Award size={18} />
              Certificados
            </Link>
          </div>
        </section>
      </div>
      <p className={styles.info}>
        Vista pública de diseño. No hay una cuenta administrativa iniciada,
        datos reales ni operaciones de gestión habilitadas.
      </p>
    </>
  );
}

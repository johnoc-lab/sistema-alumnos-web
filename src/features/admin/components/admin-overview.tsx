import { ImpulsoBrand } from "@/components/institutional/identity";
import Link from "next/link";
import {
  Users,
  BookOpen,
  CalendarDays,
  ArrowRight,
  FolderOpen,
  MessageSquare,
  Award,
} from "lucide-react";
import { getPreviewData } from "@/features/preview/fixtures";
import { previewHref, type OrganizationSlug } from "@/features/preview/routes";
import { Badge } from "@/components/ui/primitives";
import styles from "@/features/dashboard/components/dashboard.module.css";

export function AdminOverview({
  organizationSlug,
}: {
  organizationSlug: OrganizationSlug;
}) {
  const data = getPreviewData(organizationSlug);
  const isImpulso = organizationSlug === "impulso";
  return (
    <div className={styles.adminDashboard} data-organization={organizationSlug}>
      <section className={styles.adminHero}>
        <div className={styles.adminHeroCopy}>
          <span className={styles.adminEyebrow}>PANEL DE ADMINISTRACIÓN</span>
          <h1>
            {isImpulso
              ? "Ideas que se convierten en acción"
              : "Un espacio para crear y crecer"}
          </h1>
          <p>
            {isImpulso
              ? "Acompaña cada iniciativa y mantén a tu comunidad en movimiento."
              : "Organiza el aprendizaje y acompaña cada nueva idea de tu comunidad."}
          </p>
        </div>
        {isImpulso && <ImpulsoBrand prominent />}
      </section>

      <div className={styles.adminOverviewHeading}>
        <div>
          <h2>Tu comunidad, en perspectiva</h2>
          <p>Un resumen para empezar a gestionar el día.</p>
        </div>
        <Badge tone={isImpulso ? "amber" : "purple"}>Solo visualización</Badge>
      </div>

      <section
        className={styles.stats + " " + styles.adminStats}
        aria-label="Resumen de datos ficticios"
      >
        <div className={styles.stat + " " + styles.adminStat}>
          <div className={styles.statIcon + " " + styles.adminStatIcon}>
            <Users size={20} />
          </div>
          <div>
            <strong>{String(data.students.length).padStart(2, "0")}</strong>
            <span>Alumnos de ejemplo</span>
          </div>
        </div>
        <div className={styles.stat + " " + styles.adminStat}>
          <div className={styles.statIcon + " " + styles.adminStatIcon}>
            <BookOpen size={20} />
          </div>
          <div>
            <strong>
              {String(
                data.courses.filter((course) => course.status === "published")
                  .length,
              ).padStart(2, "0")}
            </strong>
            <span>Talleres publicados ficticios</span>
          </div>
        </div>
        <div className={styles.stat + " " + styles.adminStat}>
          <div className={styles.statIcon + " " + styles.adminStatIcon}>
            <CalendarDays size={20} />
          </div>
          <div>
            <strong>—</strong>
            <span>Calendario por conectar</span>
          </div>
        </div>
      </section>

      <div className={styles.lower + " " + styles.adminLower}>
        <section className={styles.panel + " " + styles.adminPanel}>
          <div
            className={styles.sectionHeading + " " + styles.adminSectionHeading}
          >
            <div>
              <span className={styles.adminPanelEyebrow}>COMUNIDAD</span>
              <h2>Personas que avanzan</h2>
            </div>
            <Link href={previewHref(organizationSlug, "admin/alumnos")}>
              Ver alumnos
              <ArrowRight size={13} />
            </Link>
          </div>
          <div className={styles.list + " " + styles.adminList}>
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
        <section className={styles.panel + " " + styles.adminPanel}>
          <span className={styles.adminPanelEyebrow}>ACCESOS DIRECTOS</span>
          <h2 className={styles.panelTitle + " " + styles.adminPanelTitle}>
            Tu espacio de gestión
          </h2>
          <div className={styles.quickGrid + " " + styles.adminQuickGrid}>
            <Link href={previewHref(organizationSlug, "admin/cursos")}>
              <BookOpen size={18} />
              Talleres
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
    </div>
  );
}

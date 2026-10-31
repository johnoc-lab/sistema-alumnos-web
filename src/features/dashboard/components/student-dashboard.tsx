import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  FolderOpen,
  Orbit,
  MessageSquare,
} from "lucide-react";
import type { OrganizationSlug } from "@/features/preview/routes";
import { previewHref } from "@/features/preview/routes";
import { getPreviewData } from "@/features/preview/fixtures";
import { CourseCard } from "@/features/courses/components/course-card";
import ui from "@/components/ui/ui.module.css";
import styles from "./dashboard.module.css";
export function StudentDashboard({
  organizationSlug,
}: {
  organizationSlug: OrganizationSlug;
}) {
  const data = getPreviewData(organizationSlug);
  const courses = data.courses.filter(
    (course) => course.status === "published",
  );
  return (
    <>
      <div className={styles.hero}>
        <div>
          <span className={ui.eyebrow}>TU ESPACIO DE APRENDIZAJE</span>
          <h1>
            Hola, <span>{data.studentName}.</span>
          </h1>
          <p>Un paso más cerca de lo que quieres construir.</p>
        </div>
        <div className={styles.heroIcon} aria-hidden="true">
          <Orbit size={32} strokeWidth={1.1} />
        </div>
      </div>
      <section className={styles.stats} aria-label="Resumen de ejemplo">
        <div className={styles.stat}>
          <div className={styles.statIcon}>
            <BookOpen size={19} />
          </div>
          <div>
            <strong>{courses.length}</strong>
            <span>Talleres de ejemplo</span>
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIcon}>
            <CalendarDays size={19} />
          </div>
          <div>
            <strong>02</strong>
            <span>Sesiones ilustrativas</span>
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIcon}>
            <FolderOpen size={19} />
          </div>
          <div>
            <strong>12</strong>
            <span>Materiales ilustrativos</span>
          </div>
        </div>
      </section>
      <section>
        <div className={styles.sectionHeading}>
          <h2>Continúa aprendiendo</h2>
          <Link href={previewHref(organizationSlug, "dashboard/cursos")}>
            Todos mis talleres
            <ArrowRight size={14} />
          </Link>
        </div>
        <div className={styles.grid}>
          {courses.slice(0, 3).map((course, index) => (
            <CourseCard key={course.id} course={course} index={index} />
          ))}
        </div>
      </section>
      <div className={styles.lower}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            <MessageSquare size={16} />
            Tu tablón de avisos
          </h2>
          <article className={styles.notice}>
            <time>28 OCT · EJEMPLO</time>
            <h3>Tu material de trabajo está listo</h3>
            <p>
              Este aviso ficticio muestra dónde aparecerán las novedades de tus
              talleres.
            </p>
          </article>
          <article className={styles.notice}>
            <time>26 OCT · EJEMPLO</time>
            <h3>Bienvenida a tu nuevo espacio</h3>
            <p>
              Explora las interfaces. El contenido real se incorporará después
              de integrar el acceso.
            </p>
          </article>
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>
            <CalendarDays size={16} />
            Una mirada a tu agenda
          </h2>
          <div className={styles.agenda}>
            <div className={styles.date}>
              <strong>02</strong>
              <span>NOV</span>
            </div>
            <div>
              <h3>Sesión de trabajo de ejemplo</h3>
              <p>Lunes · 18:00 a 19:00 · Lima</p>
            </div>
          </div>
          <div className={styles.agenda}>
            <div className={styles.date}>
              <strong>04</strong>
              <span>NOV</span>
            </div>
            <div>
              <h3>Encuentro de preguntas de ejemplo</h3>
              <p>Miércoles · 18:00 a 19:00 · Lima</p>
            </div>
          </div>
          <Link
            className={styles.agendaLink}
            href={previewHref(organizationSlug, "dashboard/calendario")}
          >
            Explorar interfaz de calendario
            <ArrowRight size={14} />
          </Link>
        </section>
      </div>
      <p className={styles.info}>
        Nombre, progreso, cifras y agenda de esta página son ilustrativos. No
        representan matrículas, actividad ni sesiones reales.
      </p>
    </>
  );
}

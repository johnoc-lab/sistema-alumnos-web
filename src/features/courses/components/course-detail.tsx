import Link from "next/link";
import {
  BookOpen,
  Clock3,
  PlayCircle,
  LockKeyhole,
  ArrowLeft,
} from "lucide-react";
import type { PreviewCourse } from "@/features/preview/fixtures";
import { Badge } from "@/components/ui/primitives";
import styles from "@/features/dashboard/components/dashboard.module.css";
import ui from "@/components/ui/ui.module.css";
export function CourseDetail({ course }: { course: PreviewCourse }) {
  return (
    <>
      <Link
        className={styles.back}
        href={"/demo/o/" + course.organizationSlug + "/dashboard/cursos"}
      >
        <ArrowLeft size={15} />
        Volver a mis talleres
      </Link>
      <section className={styles.detailHero}>
        <Badge tone="cyan">{course.category}</Badge>
        <h1>{course.title}</h1>
        <p>{course.description}</p>
        <div className={styles.detailMeta}>
          <span>
            <BookOpen size={13} /> {course.lessons} clases ilustrativas
          </span>
          <span>
            <Clock3 size={13} /> {course.hours} horas de ejemplo
          </span>
          <span>Facilitador ficticio: {course.teacher}</span>
        </div>
      </section>
      <div className={styles.lower}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Contenido del taller · ejemplo</h2>
          {[
            "Encuentra tu punto de partida",
            "Herramientas para pasar a la acción",
            "Tu siguiente paso",
          ].map((title, index) => (
            <div className={styles.module} key={title}>
              <PlayCircle size={22} strokeWidth={1.2} />
              <div>
                <strong>
                  {String(index + 1).padStart(2, "0")} · {title}
                </strong>
                <p>Estructura ilustrativa · Reproducción no habilitada</p>
              </div>
            </div>
          ))}
        </section>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Material de trabajo</h2>
          <p className={ui.muted}>Todavía no hay archivos conectados.</p>
          <p className={styles.info}>
            Los materiales reales requerirán una matrícula válida y autorización
            de descarga.
          </p>
          <div className={ui.notice}>
            <LockKeyhole size={14} /> Esta demostración no reproduce videos ni
            descarga documentos.
          </div>
        </section>
      </div>
    </>
  );
}

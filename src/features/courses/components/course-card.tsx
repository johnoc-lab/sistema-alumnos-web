import Link from "next/link";
import {
  Orbit,
  ChartNoAxesCombined,
  MessagesSquare,
  BookOpen,
  Clock3,
  ArrowRight,
} from "lucide-react";
import type { PreviewCourse } from "@/features/preview/fixtures";
import styles from "./course-card.module.css";
export function CourseCard({
  course,
  index = 0,
}: {
  course: PreviewCourse;
  index?: number;
}) {
  const Art =
    course.tone === "purple"
      ? ChartNoAxesCombined
      : course.tone === "green"
        ? MessagesSquare
        : Orbit;
  return (
    <Link
      className={styles.card}
      href={
        "/demo/o/" + course.organizationSlug + "/dashboard/cursos/" + course.id
      }
    >
      <div
        className={
          styles.art +
          " " +
          (course.tone === "purple"
            ? styles.purple
            : course.tone === "green"
              ? styles.green
              : "")
        }
      >
        <span className={styles.category}>{course.category}</span>
        <Art size={65} strokeWidth={0.8} aria-hidden="true" />
        <span className={styles.number} aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div className={styles.content}>
        <h3>{course.title}</h3>
        <p>{course.description}</p>
        <div className={styles.meta}>
          <span>
            <BookOpen size={12} />
            {course.lessons} clases
          </span>
          <span>
            <Clock3 size={12} />
            {course.hours} horas
          </span>
        </div>
        <div className={styles.progressLabel}>
          <span>Progreso de ejemplo</span>
          <span>{course.progress}%</span>
        </div>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label={"Progreso ficticio de " + course.title}
          aria-valuenow={course.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <span style={{ width: course.progress + "%" }} />
        </div>
        <div className={styles.bottom}>
          <span>{course.progress ? "Explorar taller" : "Conocer taller"}</span>
          <ArrowRight size={15} />
        </div>
      </div>
    </Link>
  );
}

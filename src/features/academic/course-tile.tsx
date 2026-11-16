import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import css from "./academic.module.css";
export function CourseTile({
  title,
  description,
  tag,
  href,
  progress,
  variant = 0,
}: {
  title: string;
  description: string;
  tag: string;
  href: string;
  progress: number | null;
  variant?: number;
}) {
  return (
    <article className={css.tile}>
      <div
        className={
          css.courseBanner +
          " " +
          (variant % 3 === 1 ? css.sage : variant % 3 === 2 ? css.gold : "")
        }
        aria-hidden="true"
      >
        <BookOpen />
      </div>
      <div className={css.tileBody}>
        <span className={css.tileTag}>{tag || "Taller académico"}</span>
        <h3>{title}</h3>
        <p>
          {description ||
            "Consulta los materiales y actividades de este taller."}
        </p>
      </div>
      <div className={css.tileFooter}>
        {progress !== null ? (
          <>
            <span>{progress}% completado</span>
            <progress
              value={progress}
              max={100}
              aria-label={"Avance de " + title}
            />
          </>
        ) : (
          <span className={css.hint}>Sin avance registrado</span>
        )}
        <Link href={href} className={css.openCourse} aria-label={"Abrir taller: " + title}>
          Abrir taller <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

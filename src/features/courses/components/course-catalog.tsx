"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import type { PreviewCourse } from "@/features/preview/fixtures";
import { normalizeSearch } from "@/features/preview/presentation";
import { PageHeading } from "@/components/ui/primitives";
import { CourseCard } from "./course-card";
import styles from "./course-catalog.module.css";
export function CourseCatalog({
  courses,
}: {
  courses: readonly PreviewCourse[];
}) {
  const [search, setSearch] = useState("");
  const visible = courses.filter(
    (course) =>
      course.status === "published" &&
      normalizeSearch(course.title + " " + course.category).includes(
        normalizeSearch(search),
      ),
  );
  return (
    <>
      <PageHeading
        eyebrow="MI BIBLIOTECA"
        title="Mis talleres"
        description="Un espacio para tus ideas, a tu propio ritmo."
      />
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} />
          <input
            aria-label="Buscar talleres de ejemplo"
            placeholder="Buscar un taller..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className={styles.count} aria-live="polite">
          {visible.length}{" "}
          {visible.length === 1 ? "taller de ejemplo" : "talleres de ejemplo"}
        </span>
      </div>
      <div className={styles.grid}>
        {visible.map((course, index) => (
          <CourseCard key={course.id} course={course} index={index} />
        ))}
        {!visible.length && (
          <p className={styles.empty}>
            No hay talleres de ejemplo con esa búsqueda.
          </p>
        )}
      </div>
      <p className={styles.note}>
        La biblioteca y los indicadores son ficticios. No se consulta ni
        modifica ninguna matrícula.
      </p>
    </>
  );
}

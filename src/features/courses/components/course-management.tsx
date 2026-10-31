"use client";
import { useRef, useState } from "react";
import { Search, Plus, Eye } from "lucide-react";
import type { PreviewCourse } from "@/features/preview/fixtures";
import { normalizeSearch } from "@/features/preview/presentation";
import { PageHeading, Badge } from "@/components/ui/primitives";
import { PreviewDialog } from "@/components/ui/preview-dialog";
import styles from "@/components/ui/management.module.css";
import ui from "@/components/ui/ui.module.css";
export function CourseManagement({
  courses,
}: {
  courses: readonly PreviewCourse[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [selected, setSelected] = useState<PreviewCourse | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const visible = courses.filter(
    (course) =>
      (filter === "all" || course.status === filter) &&
      normalizeSearch(course.title + " " + course.category).includes(
        normalizeSearch(search),
      ),
  );
  function open(course: PreviewCourse | null) {
    setSelected(course);
    dialog.current?.showModal();
  }
  return (
    <>
      <PageHeading
        eyebrow="CONTENIDO · ADMINISTRACIÓN"
        title="Talleres"
        description="Organiza el conocimiento que inspira nuevos pasos."
        action={
          <button
            className={ui.secondaryLink}
            type="button"
            onClick={() => open(null)}
          >
            <Plus size={15} />
            Ver formulario
          </button>
        }
      />
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} />
          <input
            aria-label="Buscar talleres administrativos ficticios"
            placeholder="Buscar título o categoría..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className={styles.tabs} aria-label="Filtrar talleres de ejemplo">
          {(
            [
              { value: "all", label: "Todos" },
              { value: "published", label: "Publicados" },
              { value: "draft", label: "Borradores" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={filter === tab.value}
              onClick={() => setFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <p className={styles.count} aria-live="polite">
        {visible.length}{" "}
        {visible.length === 1 ? "taller ficticio" : "talleres ficticios"} ·
        Estados de presentación
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption
            className={ui.eyebrow}
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
            }}
          >
            Talleres ficticios de la organización de demostración
          </caption>
          <thead>
            <tr>
              <th scope="col">TALLER</th>
              <th scope="col">ESTADO</th>
              <th scope="col">CLASES</th>
              <th scope="col">INSCRITOS ILUSTRATIVOS</th>
              <th scope="col">VISTA</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((course) => (
              <tr key={course.id}>
                <td className={styles.titleCell}>
                  <small>{course.category}</small>
                  <span className={styles.name}>{course.title}</span>
                </td>
                <td>
                  <Badge
                    tone={course.status === "published" ? "green" : "amber"}
                  >
                    {course.status === "published"
                      ? "Publicado · ejemplo"
                      : "Borrador · ejemplo"}
                  </Badge>
                </td>
                <td className={styles.muted}>{course.lessons} clases</td>
                <td className={styles.muted}>{course.students} alumnos</td>
                <td>
                  <button
                    type="button"
                    className={styles.rowButton}
                    onClick={() => open(course)}
                    aria-label={"Ver ficha ficticia de " + course.title}
                  >
                    <Eye size={13} />
                    Ver ficha
                  </button>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  No hay talleres ficticios con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Publicación, matrículas y edición no están habilitadas. Los borradores
        se conservan en esta vista sin alterar sus relaciones.
      </p>
      <PreviewDialog
        dialogRef={dialog}
        title={
          selected
            ? "Ficha de taller · ejemplo"
            : "Nuevo taller · vista del formulario"
        }
        fields={[
          { label: "Título", value: selected?.title ?? "" },
          {
            label: "Descripción",
            value: selected?.description ?? "",
            multiline: true,
          },
          { label: "Categoría", value: selected?.category ?? "" },
          {
            label: "Estado",
            value: selected
              ? selected.status === "published"
                ? "Publicado"
                : "Borrador"
              : "",
          },
          { label: "Facilitador (ejemplo)", value: selected?.teacher ?? "" },
        ]}
      />
    </>
  );
}

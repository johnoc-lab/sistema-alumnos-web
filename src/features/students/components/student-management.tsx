"use client";
import { useRef, useState } from "react";
import { Search, Plus, Eye } from "lucide-react";
import type { PreviewStudent } from "@/features/preview/fixtures";
import { normalizeSearch } from "@/features/preview/presentation";
import { Badge, PageHeading } from "@/components/ui/primitives";
import { PreviewDialog } from "@/components/ui/preview-dialog";
import styles from "@/components/ui/management.module.css";
import ui from "@/components/ui/ui.module.css";
const labels = {
  active: "Activo",
  suspended: "En pausa",
  invited: "Invitación ilustrativa",
} as const;
export function StudentManagement({
  students,
}: {
  students: readonly PreviewStudent[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<
    "all" | "active" | "invited" | "suspended"
  >("all");
  const [selected, setSelected] = useState<PreviewStudent | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const visible = students.filter(
    (student) =>
      (filter === "all" || student.status === filter) &&
      normalizeSearch(student.name + " " + student.email).includes(
        normalizeSearch(search),
      ),
  );
  function open(student: PreviewStudent | null) {
    setSelected(student);
    dialog.current?.showModal();
  }
  return (
    <>
      <PageHeading
        eyebrow="PERSONAS · ADMINISTRACIÓN"
        title="Alumnos"
        description="Acompaña a las personas detrás de cada nuevo proyecto."
        action={
          <button
            type="button"
            className={ui.secondaryLink}
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
            aria-label="Buscar alumnos ficticios"
            placeholder="Buscar nombre o correo..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className={styles.tabs} aria-label="Filtrar alumnos de ejemplo">
          {(
            [
              { value: "all", label: "Todos" },
              { value: "active", label: "Activos" },
              { value: "invited", label: "Invitados" },
              { value: "suspended", label: "En pausa" },
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
        {visible.length === 1 ? "registro ficticio" : "registros ficticios"} ·
        Ninguna invitación real enviada
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
            Alumnos ficticios de la organización de demostración
          </caption>
          <thead>
            <tr>
              <th scope="col">ALUMNO</th>
              <th scope="col">ESTADO ILUSTRATIVO</th>
              <th scope="col">TALLERES</th>
              <th scope="col">REGISTRO DE EJEMPLO</th>
              <th scope="col">VISTA</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((student) => (
              <tr key={student.id}>
                <td>
                  <div className={styles.person}>
                    <div className={styles.avatar} aria-hidden="true">
                      {student.initials}
                    </div>
                    <div>
                      <div className={styles.name}>{student.name}</div>
                      <div className={styles.email}>{student.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <Badge
                    tone={
                      student.status === "active"
                        ? "green"
                        : student.status === "invited"
                          ? "purple"
                          : "amber"
                    }
                  >
                    {labels[student.status]}
                  </Badge>
                </td>
                <td className={styles.muted}>{student.courses} talleres</td>
                <td className={styles.muted}>{student.joined}</td>
                <td>
                  <button
                    type="button"
                    className={styles.rowButton}
                    aria-label={"Ver ficha ficticia de " + student.name}
                    onClick={() => open(student)}
                  >
                    <Eye size={13} />
                    Ver ficha
                  </button>
                </td>
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td className={styles.empty} colSpan={5}>
                  No hay alumnos ficticios con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Nombre, contacto, estado y matrículas son datos sintéticos. Buscar y
        filtrar solo cambia esta vista; no hay altas, bajas ni cambios de acceso
        disponibles.
      </p>
      <PreviewDialog
        dialogRef={dialog}
        title={
          selected
            ? "Ficha de alumno · ejemplo"
            : "Nuevo alumno · vista del formulario"
        }
        fields={[
          { label: "Nombre completo", value: selected?.name ?? "" },
          { label: "Correo de contacto", value: selected?.email ?? "" },
          { label: "Estado", value: selected ? labels[selected.status] : "" },
          {
            label: "Talleres (gestión separada de datos personales)",
            value: selected ? selected.courses + " talleres ilustrativos" : "",
          },
        ]}
      />
    </>
  );
}

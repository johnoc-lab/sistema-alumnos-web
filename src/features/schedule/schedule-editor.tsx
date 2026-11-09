"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import ui from "@/components/ui/ui.module.css";
import css from "./schedule.module.css";
import {
  formatDay,
  limaDay,
  limaTime,
  modalities,
  occurrences,
  statusLabels,
  validDay,
  validTime,
  type ScheduleData,
  type ScheduleSession,
} from "./model";

export type SchedulePanel =
  | { kind: "create"; date: string; source?: ScheduleSession }
  | { kind: "detail" | "edit"; session: ScheduleSession };
const weekdays = [
  [1, "Lun"],
  [2, "Mar"],
  [3, "Mié"],
  [4, "Jue"],
  [5, "Vie"],
  [6, "Sáb"],
  [0, "Dom"],
] as const;

export function ScheduleEditor({
  panel,
  admin,
  slug,
  courses,
  onClose,
  onPanel,
  onSaved,
}: {
  panel: SchedulePanel;
  admin: boolean;
  slug: string;
  courses: ScheduleData["courses"];
  onClose: () => void;
  onPanel: (panel: SchedulePanel) => void;
  onSaved: (message: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const session = panel.kind === "create" ? panel.source : panel.session;
  const create = panel.kind === "create";
  const [course, setCourse] = useState(session?.course_id ?? "");
  const [date, setDate] = useState(
    create ? panel.date : limaDay(new Date(panel.session.starts_at)),
  );
  const [start, setStart] = useState(
    session ? limaTime(session.starts_at) : "",
  );
  const [end, setEnd] = useState(session ? limaTime(session.ends_at) : "");
  const [editTimes, setEditTimes] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [until, setUntil] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [draft, setDraft] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const selectedCourse = courses.find((item) => item.id === course);
  const draftOnly = selectedCourse?.status === "draft";
  const preview = repeat ? occurrences(date, until, days) : null;
  const invalidTimes =
    (create || editTimes) &&
    (!validDay(date) || !validTime(start) || !validTime(end) || end <= start);
  const active = session?.status === "scheduled" || session?.status === "draft";

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  async function save(fields: URLSearchParams) {
    if (pending) return;
    if (new TextEncoder().encode(fields.toString()).length > 8192) {
      setError(
        "El formulario es demasiado extenso. Acorta la descripción o el lugar.",
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await fetch("/o/" + slug + "/acciones", {
        method: "POST",
        body: fields,
      });
      const body = (await result.json()) as {
        message?: string;
        error?: string;
      };
      if (!result.ok) {
        setError(body.message ?? body.error ?? "No se pudo guardar la sesión.");
        return;
      }
      onSaved(body.message ?? "Sesión guardada.");
    } catch {
      setError(
        "No se pudo confirmar el resultado. Actualiza el horario antes de volver a guardar.",
      );
    } finally {
      setPending(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new URLSearchParams();
    for (const [name, value] of new FormData(event.currentTarget))
      if (typeof value === "string") fields.append(name, value);
    void save(fields);
  }

  function changeStatus(action: "schedule-cancel" | "schedule-publish") {
    if (!session?.row_version) return;
    void save(
      new URLSearchParams({
        action,
        id: session.id,
        version: String(session.row_version),
      }),
    );
  }

  const title =
    panel.kind === "detail"
      ? "Detalle de la sesión"
      : create
        ? "Nueva sesión"
        : "Editar sesión";
  return (
    <dialog
      className={css.dialog}
      ref={dialog}
      aria-labelledby="schedule-dialog-title"
      onClose={onClose}
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
    >
      <div className={css.dialogHeader}>
        <div>
          <p className={ui.eyebrow}>HORARIO ACADÉMICO</p>
          <h2 id="schedule-dialog-title">{title}</h2>
        </div>
        <button
          type="button"
          disabled={pending}
          className={ui.secondaryLink}
          onClick={() => dialog.current?.close()}
        >
          Cerrar
        </button>
      </div>
      {error && (
        <p className={css.error} role="alert">
          {error}
        </p>
      )}
      {panel.kind === "detail" ? (
        <div className={css.details}>
          <span className={css.status} data-status={panel.session.status}>
            {statusLabels[panel.session.status]}
          </span>
          <h3>{panel.session.title}</h3>
          <p>{selectedCourse?.title}</p>
          <p>
            {formatDay(limaDay(new Date(panel.session.starts_at)))} ·{" "}
            {limaTime(panel.session.starts_at)} a{" "}
            {limaTime(panel.session.ends_at)}
            {limaDay(new Date(panel.session.starts_at)) !==
            limaDay(new Date(panel.session.ends_at))
              ? " del " + formatDay(limaDay(new Date(panel.session.ends_at)))
              : ""}
          </p>
          <p>
            {panel.session.modality
              ? modalities[panel.session.modality]
              : "Modalidad sin indicar"}
            {panel.session.location && " · " + panel.session.location}
          </p>
          {panel.session.description && (
            <p className={css.description}>{panel.session.description}</p>
          )}
          {panel.session.series_id && (
            <p className={css.muted}>Parte de una serie semanal.</p>
          )}
          {admin && (
            <>
              {panel.session.attendance_locked && (
                <p className={css.info}>
                  Hay registros de asistencia asociados. Para cambiar el
                  horario, cancela esta sesión y crea una de reemplazo.
                </p>
              )}
              <div className={css.actions}>
                {active && (
                  <button
                    type="button"
                    disabled={pending}
                    className={ui.secondaryLink}
                    onClick={() =>
                      onPanel({ kind: "edit", session: panel.session })
                    }
                  >
                    Editar
                  </button>
                )}
                {panel.session.status === "draft" && (
                  <button
                    type="button"
                    disabled={pending}
                    className={ui.primaryLink}
                    onClick={() => changeStatus("schedule-publish")}
                  >
                    Programar
                  </button>
                )}
                {panel.session.status === "scheduled" && (
                  <Link
                    href={
                      "/o/" +
                      slug +
                      "/admin/asistencia?course=" +
                      panel.session.course_id +
                      "&event=" +
                      panel.session.id
                    }
                    className={ui.secondaryLink}
                  >
                    Abrir Asistencia
                  </Link>
                )}
                {active && !confirmCancel && (
                  <button
                    type="button"
                    disabled={pending}
                    className={ui.secondaryLink}
                    onClick={() => setConfirmCancel(true)}
                  >
                    Cancelar sesión
                  </button>
                )}
                {panel.session.status === "cancelled" && (
                  <button
                    type="button"
                    className={ui.primaryLink}
                    onClick={() =>
                      onPanel({
                        kind: "create",
                        date: limaDay(),
                        source: panel.session,
                      })
                    }
                  >
                    Crear sesión de reemplazo
                  </button>
                )}
              </div>
              {confirmCancel && (
                <div className={css.info}>
                  <p>
                    La sesión quedará cancelada y sus registros seguirán
                    asociados.
                  </p>
                  <div className={css.actions}>
                    <button
                      type="button"
                      disabled={pending}
                      className={ui.primaryLink}
                      onClick={() => changeStatus("schedule-cancel")}
                    >
                      Confirmar cancelación
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      className={ui.secondaryLink}
                      onClick={() => setConfirmCancel(false)}
                    >
                      Volver
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        admin && (
          <form onSubmit={submit} className={css.form}>
            <input
              type="hidden"
              name="action"
              value={create ? "schedule-create" : "schedule-edit"}
            />
            {!create && (
              <>
                <input type="hidden" name="id" value={session?.id} />
                <input
                  type="hidden"
                  name="version"
                  value={session?.row_version ?? ""}
                />
              </>
            )}
            {create ? (
              <label>
                Taller
                <select
                  name="course"
                  required
                  value={course}
                  onChange={(event) => setCourse(event.target.value)}
                >
                  <option value="">Selecciona un taller</option>
                  {courses
                    .filter((item) => item.status !== "archived")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <p className={css.muted}>{selectedCourse?.title}</p>
            )}
            <label>
              Título
              <input
                name="title"
                required
                maxLength={500}
                defaultValue={session?.title ?? ""}
              />
            </label>
            <label>
              Descripción (opcional)
              <textarea
                name="description"
                maxLength={1000}
                rows={3}
                defaultValue={session?.description ?? ""}
              />
            </label>
            <div className={css.fields}>
              <label>
                Modalidad
                <select name="modality" defaultValue={session?.modality ?? ""}>
                  <option value="">Sin indicar</option>
                  {Object.entries(modalities).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Lugar o aula (opcional)
                <input
                  name="location"
                  maxLength={160}
                  defaultValue={session?.location ?? ""}
                />
              </label>
            </div>
            {!create && !session?.attendance_locked && (
              <label className={css.check}>
                <input
                  name="editTimes"
                  type="checkbox"
                  value="yes"
                  checked={editTimes}
                  onChange={(event) => setEditTimes(event.target.checked)}
                />{" "}
                Cambiar fecha y horas
              </label>
            )}
            {!create && session?.attendance_locked && (
              <p className={css.info}>
                La fecha y las horas están protegidas por los registros de
                asistencia.
              </p>
            )}
            {(create || editTimes) && (
              <div className={css.fields}>
                <label>
                  {create && repeat ? "Fecha inicial" : "Fecha"}
                  <input
                    name="date"
                    type="date"
                    required
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label>
                  Inicio en Lima
                  <input
                    name="start"
                    type="time"
                    required
                    value={start}
                    onChange={(event) => setStart(event.target.value)}
                  />
                </label>
                <label>
                  Fin en Lima
                  <input
                    name="end"
                    type="time"
                    required
                    value={end}
                    onChange={(event) => setEnd(event.target.value)}
                  />
                </label>
              </div>
            )}
            {(create || editTimes) && start && end && end <= start && (
              <p className={css.error} role="alert">
                La hora final debe ser posterior a la inicial.
              </p>
            )}
            {create && (
              <>
                <label>
                  Estado
                  <select
                    name="status"
                    value={draft || draftOnly ? "draft" : "scheduled"}
                    onChange={(event) =>
                      setDraft(event.target.value === "draft")
                    }
                  >
                    <option value="scheduled" disabled={draftOnly}>
                      Programada
                    </option>
                    <option value="draft">Borrador</option>
                  </select>
                </label>
                {draftOnly && (
                  <p className={css.muted}>
                    Publica el taller antes de programar sus sesiones.
                  </p>
                )}
                <label className={css.check}>
                  <input
                    type="checkbox"
                    name="repeat"
                    value="weekly"
                    checked={repeat}
                    onChange={(event) => setRepeat(event.target.checked)}
                  />{" "}
                  Repetir semanalmente
                </label>
                {repeat && (
                  <>
                    <label>
                      Fecha final (inclusive)
                      <input
                        name="until"
                        type="date"
                        required
                        min={date}
                        value={until}
                        onChange={(event) => setUntil(event.target.value)}
                      />
                    </label>
                    <fieldset className={css.weekdays}>
                      <legend>Días de la semana</legend>
                      {weekdays.map(([value, label]) => (
                        <label key={value} className={css.check}>
                          <input
                            name="weekday"
                            value={value}
                            type="checkbox"
                            checked={days.includes(value)}
                            onChange={(event) =>
                              setDays((selected) =>
                                event.target.checked
                                  ? [...selected, value]
                                  : selected.filter((day) => day !== value),
                              )
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </fieldset>
                    <section
                      className={css.preview}
                      aria-label="Vista previa de sesiones"
                    >
                      <h3>
                        Vista previa
                        {preview?.dates.length
                          ? " · " + preview.dates.length + " sesiones"
                          : ""}
                      </h3>
                      {preview?.error ? (
                        <p role="status">{preview.error}</p>
                      ) : (
                        <ol>
                          {preview?.dates.map((day) => (
                            <li key={day}>
                              {formatDay(day)} · {start || "—"} a {end || "—"}
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>
                  </>
                )}
              </>
            )}
            <button
              className={ui.primaryLink}
              type="submit"
              disabled={
                pending ||
                invalidTimes ||
                Boolean(preview?.error) ||
                (create && !selectedCourse)
              }
            >
              {pending
                ? "Guardando…"
                : repeat && preview?.dates.length
                  ? "Confirmar " + preview.dates.length + " sesiones"
                  : "Guardar sesión"}
            </button>
          </form>
        )
      )}
    </dialog>
  );
}

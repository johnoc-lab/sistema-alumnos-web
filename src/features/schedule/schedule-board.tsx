"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import ui from "@/components/ui/ui.module.css";
import css from "./schedule.module.css";
import { ScheduleEditor, type SchedulePanel } from "./schedule-editor";
import {
  formatDay,
  limaDay,
  limaTime,
  plusDays,
  scheduleRange,
  shiftSchedule,
  statusLabels,
  validDay,
  type ScheduleData,
  type ScheduleQuery,
  type ScheduleSession,
} from "./model";

const dayNames = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];
const empty: ScheduleData = { courses: [], sessions: [] };
function queryParams(query: ScheduleQuery) {
  const params = new URLSearchParams({ date: query.date, view: query.view });
  if (query.course) params.set("course", query.course);
  return params;
}
function tone(course: string) {
  return [...course].reduce(
    (total, char) => (total * 31 + char.charCodeAt(0)) % 6,
    0,
  );
}
function daySlots(sessions: ScheduleSession[], from: string, to: string) {
  const slots = new Map<string, ScheduleSession[]>();
  for (const session of sessions) {
    const start = limaDay(new Date(session.starts_at));
    const end = limaDay(new Date(new Date(session.ends_at).getTime() - 1));
    for (
      let day = start < from ? from : start;
      day <= end && day < to;
      day = plusDays(day, 1)
    ) {
      const list = slots.get(day) ?? [];
      list.push(session);
      slots.set(day, list);
    }
  }
  return slots;
}
function hourOf(session: ScheduleSession, day: string) {
  return limaDay(new Date(session.starts_at)) < day
    ? 0
    : Number(limaTime(session.starts_at).slice(0, 2));
}

export function ScheduleBoard({
  slug,
  admin,
  canOpenAttendance,
  initialQuery,
  initialData,
  initialNotice,
}: {
  slug: string;
  admin: boolean;
  canOpenAttendance: boolean;
  initialQuery: ScheduleQuery;
  initialData: ScheduleData | null;
  initialNotice: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [data, setData] = useState(initialData ?? empty);
  const [error, setError] = useState(
    initialData ? "" : "No se pudo cargar el horario. Inténtalo de nuevo.",
  );
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(initialNotice);
  const [panel, setPanel] = useState<SchedulePanel | null>(null);
  const request = useRef<AbortController>(null);
  const range = useMemo(() => scheduleRange(query), [query]);
  const slots = useMemo(
    () => daySlots(data.sessions.slice(0, 1000), range.from, range.to),
    [data, range.from, range.to],
  );
  const courseNames = useMemo(
    () => new Map(data.courses.map(({ id, title }) => [id, title])),
    [data],
  );
  useEffect(() => () => request.current?.abort(), []);

  async function refresh(next: ScheduleQuery, replaceUrl = true) {
    if (!validDay(next.date)) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setQuery(next);
    setLoading(true);
    setError("");
    const params = queryParams(next);
    if (replaceUrl)
      window.history.replaceState(
        null,
        "",
        window.location.pathname + "?" + params.toString(),
      );
    if (admin) params.set("scope", "admin");
    try {
      const response = await fetch(
        "/o/" + slug + "/horario/datos?" + params.toString(),
        {
          cache: "no-store",
          signal: controller.signal,
        },
      );
      if (!response.ok) throw Error("schedule_unavailable");
      const result = (await response.json()) as ScheduleData;
      if (!controller.signal.aborted) setData(result);
    } catch {
      if (controller.signal.aborted) return;
      setData(empty);
      setError(
        "No se pudo cargar el horario. Revisa tu sesión e inténtalo nuevamente.",
      );
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function browse(next: ScheduleQuery) {
    setNotice("");
    void refresh(next);
  }

  function sessionCard(session: ScheduleSession) {
    return (
      <button
        key={session.id}
        className={css.session}
        type="button"
        data-tone={tone(session.course_id)}
        data-status={session.status}
        onClick={() => setPanel({ kind: "detail", session })}
      >
        <small>
          {limaTime(session.starts_at)}–{limaTime(session.ends_at)}
        </small>
        <strong>{session.title}</strong>
        <span>{courseNames.get(session.course_id)}</span>
        {session.status !== "scheduled" && (
          <small className={css.sessionState}>
            {statusLabels[session.status]}
          </small>
        )}
      </button>
    );
  }

  const hoursInUse = range.days.flatMap((day) =>
    (slots.get(day) ?? []).map((session) => hourOf(session, day)),
  );
  const firstHour = Math.min(8, ...hoursInUse);
  const lastHour = Math.max(18, ...hoursInUse);
  const hours = Array.from(
    { length: lastHour - firstHour + 1 },
    (_, i) => firstHour + i,
  );
  const today = limaDay();
  return (
    <section className={css.board} aria-label="Horario académico">
      <header className={css.toolbar}>
        <div className={css.toolbarLine}>
          <div>
            <p className={ui.eyebrow}>HORA DE LIMA</p>
            <h2>{range.title}</h2>
          </div>
          {admin && (
            <button
              className={ui.primaryLink}
              type="button"
              disabled={loading || Boolean(error)}
              onClick={() => setPanel({ kind: "create", date: query.date })}
            >
              <Plus size={17} aria-hidden="true" />
              Nueva sesión
            </button>
          )}
        </div>
        <div className={css.controls}>
          <div
            className={css.actions}
            role="group"
            aria-label="Navegación de fechas"
          >
            <button
              className={ui.secondaryLink}
              type="button"
              aria-label="Período anterior"
              onClick={() =>
                browse({ ...query, date: shiftSchedule(query, -1) })
              }
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              className={ui.secondaryLink}
              type="button"
              onClick={() => browse({ ...query, date: today })}
            >
              Hoy
            </button>
            <button
              className={ui.secondaryLink}
              type="button"
              aria-label="Período siguiente"
              onClick={() =>
                browse({ ...query, date: shiftSchedule(query, 1) })
              }
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
          <div
            className={css.actions}
            role="group"
            aria-label="Vista del horario"
          >
            {(["week", "month"] as const).map((view) => (
              <button
                key={view}
                type="button"
                aria-pressed={query.view === view}
                className={
                  query.view === view ? ui.primaryLink : ui.secondaryLink
                }
                onClick={() => browse({ ...query, view })}
              >
                {view === "week" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
          <label>
            {query.view === "week" ? "Ir a la semana de" : "Ir al mes"}
            <input
              type={query.view === "week" ? "date" : "month"}
              value={
                query.view === "week" ? query.date : query.date.slice(0, 7)
              }
              onChange={(event) =>
                browse({
                  ...query,
                  date:
                    event.target.value + (query.view === "month" ? "-01" : ""),
                })
              }
            />
          </label>
          <label>
            Taller
            <select
              value={query.course}
              onChange={(event) =>
                browse({ ...query, course: event.target.value })
              }
            >
              <option value="">Todos los talleres</option>
              {query.course && !courseNames.has(query.course) && (
                <option value={query.course}>Taller seleccionado</option>
              )}
              {data.courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {notice && (
        <p className={css.info} role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status" className={css.empty}>
          Cargando horario…
        </p>
      ) : error ? (
        <div className={css.empty}>
          <p role="alert">{error}</p>
          <button
            type="button"
            className={ui.secondaryLink}
            onClick={() => void refresh(query)}
          >
            Reintentar
          </button>
        </div>
      ) : (
        <>
          {data.sessions.length > 1000 && (
            <p role="status" className={css.info}>
              Se muestran las primeras 1000 sesiones. Filtra por taller para
              acotar la vista.
            </p>
          )}
          {data.sessions.length === 0 && (
            <div className={css.empty}>
              <CalendarDays size={28} aria-hidden="true" />
              <h3>Sin sesiones en este período</h3>
              <p>
                {admin
                  ? "Selecciona otro rango o crea una sesión."
                  : "Aquí aparecerán las clases programadas de tus talleres."}
              </p>
            </div>
          )}
          {(admin || data.sessions.length > 0) && (
            <>
              {query.view === "week" ? (
                <div className={css.week} aria-label="Semana por día y hora">
                  <div className={css.axis}>Hora</div>
                  {range.days.map((day) => (
                    <div
                      key={day}
                      className={css.dayHead}
                      data-today={day === today}
                    >
                      {formatDay(day)}
                    </div>
                  ))}
                  {hours.map((hour) => (
                    <div key={hour} className={css.weekRow}>
                      <div className={css.axis}>
                        {String(hour).padStart(2, "0")}:00
                      </div>
                      {range.days.map((day) => (
                        <div
                          key={day}
                          className={css.slot}
                          data-today={day === today}
                        >
                          {(slots.get(day) ?? [])
                            .filter((session) => hourOf(session, day) === hour)
                            .map(sessionCard)}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : (
                <div className={css.month} aria-label="Horario mensual">
                  {dayNames.map((label) => (
                    <div key={label} className={css.dayHead}>
                      {label}
                    </div>
                  ))}
                  {range.days.map((day) => (
                    <div
                      key={day}
                      className={css.monthDay}
                      data-outside={day.slice(0, 7) !== query.date.slice(0, 7)}
                      data-today={day === today}
                    >
                      {admin ? (
                        <button
                          className={css.dayNumber}
                          type="button"
                          aria-label={"Nueva sesión para " + formatDay(day)}
                          onClick={() =>
                            setPanel({ kind: "create", date: day })
                          }
                        >
                          {Number(day.slice(-2))}
                        </button>
                      ) : (
                        <span className={css.dayNumber}>
                          {Number(day.slice(-2))}
                        </span>
                      )}
                      {(slots.get(day) ?? []).map(sessionCard)}
                    </div>
                  ))}
                </div>
              )}
              <div className={css.mobile}>
                {range.days
                  .filter((day) => slots.has(day))
                  .map((day) => (
                    <section key={day}>
                      <h3>{formatDay(day)}</h3>
                      {(slots.get(day) ?? []).map(sessionCard)}
                    </section>
                  ))}
              </div>
            </>
          )}
        </>
      )}
      {panel && (
        <ScheduleEditor
          key={
            panel.kind +
            (panel.kind === "create" ? panel.date : panel.session.id)
          }
          panel={panel}
          canOpenAttendance={canOpenAttendance}
          admin={admin}
          slug={slug}
          courses={data.courses}
          onClose={() => setPanel(null)}
          onPanel={setPanel}
          onSaved={(message) => {
            setPanel(null);
            setNotice(message);
            void refresh(query, false);
          }}
        />
      )}
    </section>
  );
}

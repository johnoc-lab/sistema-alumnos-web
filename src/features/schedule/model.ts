export const lima = "America/Lima";
export const maxSessions = 60;
export const modalities = {
  in_person: "Presencial",
  online: "Virtual",
  hybrid: "Híbrida",
} as const;
export const statusLabels = {
  draft: "Borrador",
  scheduled: "Programada",
  cancelled: "Cancelada",
  archived: "Archivada",
} as const;

export type ScheduleSession = {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  modality: keyof typeof modalities | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: keyof typeof statusLabels;
  series_id: string | null;
  row_version: number | null;
  attendance_locked: boolean;
};
export type ScheduleData = {
  courses: { id: string; title: string; status: string }[];
  sessions: ScheduleSession[];
};
export type ScheduleQuery = {
  date: string;
  view: "week" | "month";
  course: string;
};

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: lima,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("es-PE", {
  timeZone: lima,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const dayLabel = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const monthLabel = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});
const utcDate = (day: string) => new Date(day + "T00:00:00Z");
const key = (date: Date) => date.toISOString().slice(0, 10);
export function limaDay(instant: Date = new Date()): string {
  const parts = dayFormatter.formatToParts(instant);
  return ["year", "month", "day"]
    .map((unit) => parts.find((part) => part.type === unit)?.value)
    .join("-");
}
export const limaTime = (instant: string) =>
  timeFormatter.format(new Date(instant));
export const formatDay = (day: string) => dayLabel.format(utcDate(day));
export const dayOfWeek = (day: string) => utcDate(day).getUTCDay();
export function validDay(value: string): boolean {
  if (!/^(?:19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const date = utcDate(value);
  return Number.isFinite(date.getTime()) && key(date) === value;
}
export const validTime = (value: string) =>
  /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
export function plusDays(day: string, amount: number): string {
  const date = utcDate(day);
  date.setUTCDate(date.getUTCDate() + amount);
  return key(date);
}
const monday = (day: string) => plusDays(day, -((dayOfWeek(day) + 6) % 7));
const firstOfMonth = (day: string) => day.slice(0, 7) + "-01";
function shiftMonth(day: string, amount: number): string {
  const date = utcDate(firstOfMonth(day));
  date.setUTCMonth(date.getUTCMonth() + amount);
  return key(date);
}
export function scheduleRange(query: ScheduleQuery) {
  const first = query.view === "week" ? query.date : firstOfMonth(query.date);
  const from = monday(first);
  const to =
    query.view === "week"
      ? plusDays(from, 7)
      : plusDays(monday(plusDays(shiftMonth(first, 1), -1)), 7);
  const days = [];
  for (let day = from; day < to; day = plusDays(day, 1)) days.push(day);
  return {
    from,
    to,
    days,
    title:
      query.view === "week"
        ? formatDay(from) + " — " + formatDay(plusDays(to, -1))
        : monthLabel.format(utcDate(first)),
  };
}
export function shiftSchedule(query: ScheduleQuery, amount: number): string {
  return query.view === "week"
    ? plusDays(query.date, amount * 7)
    : shiftMonth(query.date, amount);
}
export function occurrences(
  from: string,
  until: string,
  weekdays: readonly number[],
) {
  if (!validDay(from) || !validDay(until) || from > until)
    return {
      dates: [],
      error: "Revisa las fechas de inicio y fin de la repetición.",
    };
  if (
    !weekdays.length ||
    weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    return { dates: [], error: "Selecciona al menos un día de la semana." };
  const dates = [];
  for (let day = from; day <= until; day = plusDays(day, 1)) {
    if (!weekdays.includes(dayOfWeek(day))) continue;
    dates.push(day);
    if (dates.length > maxSessions)
      return {
        dates: [],
        error: "Cada operación admite como máximo 60 sesiones.",
      };
  }
  return {
    dates,
    error: dates.length ? "" : "No hay sesiones en las fechas seleccionadas.",
  };
}

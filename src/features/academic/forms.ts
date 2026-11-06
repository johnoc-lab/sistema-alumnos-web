export class AcademicError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
  }
}
export const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const states = {
  content: ["draft", "published", "archived"],
  enrollment: ["active", "paused", "completed", "cancelled", "archived"],
  student: ["active", "suspended", "archived"],
  event: ["draft", "scheduled", "cancelled", "archived"],
} as const;
const hosts = new Set([
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
  "player.vimeo.com",
  "drive.google.com",
  "docs.google.com",
  "meet.google.com",
  "zoom.us",
]);
export function resourceUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !hosts.has(u.hostname) ||
      /[\s<>]/.test(value) ||
      value.length > 2000
    )
      return null;
    return u.href;
  } catch {
    return null;
  }
}
export function limaInstant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new AcademicError("invalid");
  const d = new Date(value + "-05:00");
  if (
    !Number.isFinite(d.getTime()) ||
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "America/Lima",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .format(d)
      .replace(" ", "T") !== value
  )
    throw new AcademicError("invalid");
  return d.toISOString();
}
export type AcademicCommand =
  | {
      kind: "course";
      id: string | null;
      version: number;
      title: string;
      description: string;
      tag: string;
      status: string;
      slug: string;
    }
  | {
      kind: "student";
      id: string;
      version: number;
      first_name: string;
      last_name: string;
      contact_email: string | null;
    }
  | { kind: "student-status"; id: string; version: number; status: string }
  | {
      kind: "enrollment";
      id: string | null;
      version: number;
      course_id: string;
      membership_id: string;
      status: string;
      progress_percent: number;
    }
  | {
      kind: "material";
      id: string | null;
      version: number;
      course_id: string;
      title: string;
      status: string;
      external_url: string | null;
      file_asset_id: string | null;
    }
  | {
      kind: "announcement";
      id: string | null;
      version: number;
      course_id: string;
      title: string;
      body: string;
      status: string;
    }
  | {
      kind: "event";
      id: string | null;
      version: number;
      course_id: string;
      title: string;
      status: string;
      starts_at: string;
      ends_at: string;
    }
  | { kind: "event-attendees"; id: string; version: number };
export function parseAcademicForm(form: URLSearchParams): AcademicCommand {
  const text = (key: string, max = 200, required = true) => {
    if (form.getAll(key).length > 1) throw new AcademicError("invalid");
    const v = (form.get(key) ?? "").trim();
    if (
      (required && !v) ||
      v.length > max ||
      Array.from(v).some(
        (char) =>
          char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)),
      )
    )
      throw new AcademicError("invalid");
    return v;
  };
  const ident = (key: string) => {
    const v = text(key, 36);
    if (!uuid(v)) throw new AcademicError("invalid");
    return v;
  };
  const choice = (key: string, values: readonly string[]) => {
    const v = text(key);
    if (!values.includes(v)) throw new AcademicError("invalid");
    return v;
  };
  const idValue = text("id", 36, false),
    id = idValue ? ident("id") : null;
  const versionValue = text("version", 16, false),
    version = versionValue ? Number(versionValue) : 0;
  if (id && (!Number.isSafeInteger(version) || version < 1))
    throw new AcademicError("invalid");
  const existing = () => {
    if (!id) throw new AcademicError("invalid");
    return id;
  };
  switch (text("action")) {
    case "course": {
      const slug = text("slug", 100, !id);
      if (!id && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug))
        throw new AcademicError("invalid");
      return {
        kind: "course",
        id,
        version,
        slug,
        title: text("title"),
        description: text("description", 2000, false),
        tag: text("tag", 80, false),
        status: choice("status", states.content),
      };
    }
    case "student": {
      const contact = text("contact_email", 254, false);
      if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact))
        throw new AcademicError("invalid");
      return {
        kind: "student",
        id: existing(),
        version,
        first_name: text("first_name", 100),
        last_name: text("last_name", 100, false),
        contact_email: contact || null,
      };
    }
    case "student-status":
      return {
        kind: "student-status",
        id: existing(),
        version,
        status: choice("status", states.student),
      };
    case "enrollment": {
      const progress = Number(text("progress_percent", 6, false) || "0");
      if (!Number.isFinite(progress) || progress < 0 || progress > 100)
        throw new AcademicError("invalid");
      return {
        kind: "enrollment",
        id,
        version,
        course_id: id ? "" : ident("course_id"),
        membership_id: id ? "" : ident("membership_id"),
        status: id ? choice("status", states.enrollment) : "active",
        progress_percent: progress,
      };
    }
    case "material": {
      const source = choice("source", ["link", "pdf"]);
      const url =
        source === "link" ? resourceUrl(text("external_url", 2000)) : null;
      if (source === "link" && !url) throw new AcademicError("url");
      return {
        kind: "material",
        id,
        version,
        course_id: ident("course_id"),
        title: text("title"),
        status: choice("status", states.content),
        external_url: url,
        file_asset_id: source === "pdf" ? ident("file_asset_id") : null,
      };
    }
    case "announcement":
      return {
        kind: "announcement",
        id,
        version,
        course_id: ident("course_id"),
        title: text("title"),
        body: text("body", 2000),
        status: choice("status", states.content),
      };
    case "event": {
      const starts = limaInstant(text("starts_at")),
        ends = limaInstant(text("ends_at"));
      if (ends <= starts) throw new AcademicError("invalid");
      return {
        kind: "event",
        id,
        version,
        course_id: ident("course_id"),
        title: text("title"),
        status: id ? choice("status", states.event) : "scheduled",
        starts_at: starts,
        ends_at: ends,
      };
    }
    case "event-attendees":
      return { kind: "event-attendees", id: existing(), version };
    default:
      throw new AcademicError("invalid");
  }
}
export const labels: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  archived: "Archivado",
  active: "Activo",
  paused: "Pausado",
  completed: "Completado",
  cancelled: "Cancelado",
  scheduled: "Programado",
  suspended: "Suspendido",
  invited: "Invitado",
  pending: "Pendiente",
  ready: "Listo",
};
export const noticeText: Record<string, string> = {
  saved: "Cambios guardados.",
  invalid: "Revisa los campos del formulario y las fechas.",
  duplicate: "Ya existe ese taller o matrícula. Revisa el registro existente.",
  conflict: "Este registro cambió. Recarga la página antes de editarlo.",
  unavailable: "El registro ya no está disponible o no tienes acceso.",
  failed: "No se pudo completar la operación. Inténtalo más tarde.",
  url: "Utiliza un enlace HTTPS de YouTube, Vimeo, Drive, Docs, Meet o Zoom.",
  attendees:
    "El taller necesita alumnos activos matriculados para programar el evento.",
  pdf: "Selecciona un PDF privado listo del mismo taller. La subida de archivos todavía no está habilitada.",
};
export function errorNotice(error: unknown): string {
  if (error instanceof AcademicError)
    return Object.hasOwn(noticeText, error.reason) ? error.reason : "failed";
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  return code === "23505"
    ? "duplicate"
    : code === "40001"
      ? "conflict"
      : code === "42501"
        ? "unavailable"
        : code === "23503" || code === "23514" || code === "22023"
          ? "invalid"
          : "failed";
}
export function sectionFor(kind: AcademicCommand["kind"]) {
  return kind === "student" || kind === "student-status"
    ? "alumnos"
    : kind === "course"
      ? "cursos"
      : kind === "enrollment"
        ? "matriculas"
        : kind === "material"
          ? "materiales"
          : kind === "announcement"
            ? "avisos"
            : "calendario";
}

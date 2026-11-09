import "server-only";
import { NextResponse } from "next/server";
import { uuid, limaInstant } from "@/features/academic/forms";
import { noStoreHeaders } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  limaDay,
  modalities,
  occurrences,
  scheduleRange,
  validDay,
  validTime,
  type ScheduleData,
  type ScheduleQuery,
} from "./model";

export function scheduleQuery(params: URLSearchParams): ScheduleQuery {
  const date = params.get("date") ?? "";
  const course = params.get("course") ?? "";
  return {
    date: validDay(date) ? date : limaDay(),
    view: params.get("view") === "month" ? "month" : "week",
    course: uuid(course) ? course : "",
  };
}

export async function loadSchedule(
  org: string,
  admin: boolean,
  query: ScheduleQuery,
) {
  const client = await createServerSupabaseClient();
  const range = scheduleRange(query);
  const { data, error } = await client.rpc("list_schedule", {
    p_org: org,
    p_admin: admin,
    p_from: range.from,
    p_to: range.to,
    p_course: query.course,
  });
  if (error) throw error;
  const result = data as unknown as ScheduleData;
  if (!Array.isArray(result?.courses) || !Array.isArray(result?.sessions))
    throw Error("schedule_invalid_response");
  return result;
}

export const scheduleActions = [
  "schedule-create",
  "schedule-edit",
  "schedule-cancel",
  "schedule-publish",
] as const;
type ScheduleAction = (typeof scheduleActions)[number];
export function isScheduleAction(value: string): value is ScheduleAction {
  return scheduleActions.some((action) => value === action);
}

class FormError extends Error {}
function textField(
  form: URLSearchParams,
  name: string,
  max: number,
  required = false,
) {
  const text = (form.get(name) ?? "").trim();
  if (
    form.getAll(name).length > 1 ||
    text.length > max ||
    (required && !text) ||
    text.includes("\u0000")
  )
    throw new FormError("Revisa los campos obligatorios y su longitud.");
  return text;
}
function sessionDetails(form: URLSearchParams) {
  const modality = textField(form, "modality", 20);
  if (modality && !Object.hasOwn(modalities, modality))
    throw new FormError("Selecciona una modalidad válida.");
  return {
    title: textField(form, "title", 500, true),
    description: textField(form, "description", 1000) || null,
    modality: modality || null,
    location: textField(form, "location", 160) || null,
  };
}
function formTimes(form: URLSearchParams) {
  const date = textField(form, "date", 10, true);
  const start = textField(form, "start", 5, true);
  const end = textField(form, "end", 5, true);
  if (!validDay(date) || !validTime(start) || !validTime(end) || end <= start)
    throw new FormError(
      "Indica una fecha válida y una hora final posterior a la inicial.",
    );
  return { date, start, end };
}
function errorResponse(error: unknown) {
  let message = "No se pudo guardar la sesión. Inténtalo nuevamente.";
  let status = 503;
  if (error instanceof FormError) {
    message = error.message;
    status = 400;
  } else if (error && typeof error === "object") {
    const db = error as { code?: string; message?: string };
    if (db.code === "23P01") {
      message =
        "Hay otra sesión programada de este taller que se cruza con el horario. Revisa las horas y las fechas.";
      status = 409;
    } else if (db.message === "schedule_attendance_locked") {
      message =
        "La sesión ya tiene registros de asistencia. Cancélala y crea una nueva sesión para reprogramar.";
      status = 409;
    } else if (db.code === "40001") {
      message =
        "La sesión cambió. Actualiza el horario antes de guardar nuevamente.";
      status = 409;
    } else if (db.message === "schedule_attendees") {
      message =
        "El taller necesita estar publicado y tener participantes elegibles. Puedes guardar un borrador.";
      status = 400;
    } else if (db.code === "42501") {
      message = "No tienes acceso a la sesión solicitada.";
      status = 403;
    } else if (
      db.code === "22023" ||
      db.code === "23514" ||
      db.code === "23502"
    ) {
      message = "Revisa el taller, el estado y los datos de la sesión.";
      status = 400;
    }
  }
  return NextResponse.json({ message }, { status, headers: noStoreHeaders });
}

export async function scheduleMutation(
  action: ScheduleAction,
  form: URLSearchParams,
  org: string,
) {
  try {
    const client = await createServerSupabaseClient(true);
    if (action === "schedule-create") {
      const course = textField(form, "course", 36, true);
      if (!uuid(course)) throw new FormError("Selecciona un taller válido.");
      const { date, start, end } = formTimes(form);
      const dates =
        form.get("repeat") === "weekly"
          ? occurrences(
              date,
              textField(form, "until", 10, true),
              form
                .getAll("weekday")
                .map((day) => (/^[0-6]$/.test(day) ? Number(day) : NaN)),
            )
          : { dates: [date], error: "" };
      if (dates.error) throw new FormError(dates.error);
      const result = await client.rpc("create_schedule_sessions", {
        p_org: org,
        p_course: course,
        p_dates: dates.dates,
        p_start: start,
        p_end: end,
        p_draft: form.get("status") === "draft",
        p_details: sessionDetails(form),
      });
      if (result.error) throw result.error;
      return NextResponse.json(
        {
          message:
            dates.dates.length === 1
              ? "Sesión guardada."
              : `${dates.dates.length} sesiones guardadas.`,
        },
        { headers: noStoreHeaders },
      );
    }

    const id = textField(form, "id", 36, true);
    const version = Number(textField(form, "version", 16, true));
    if (!uuid(id) || !Number.isSafeInteger(version) || version < 1)
      throw new FormError(
        "Actualiza el horario y vuelve a seleccionar la sesión.",
      );
    const patch: Record<string, string | null> =
      action === "schedule-cancel"
        ? { status: "cancelled" }
        : action === "schedule-publish"
          ? { status: "scheduled" }
          : sessionDetails(form);
    if (action === "schedule-edit" && form.get("editTimes") === "yes") {
      const { date, start, end } = formTimes(form);
      patch.starts_at = limaInstant(date + "T" + start);
      patch.ends_at = limaInstant(date + "T" + end);
    }
    const result = await client.rpc("update_schedule_session", {
      p_org: org,
      p_id: id,
      p_version: version,
      p_patch: patch,
    });
    if (result.error) throw result.error;
    return NextResponse.json(
      {
        message:
          action === "schedule-cancel"
            ? "Sesión cancelada. Se conservó su historial."
            : action === "schedule-publish"
              ? "Sesión programada."
              : "Sesión actualizada.",
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

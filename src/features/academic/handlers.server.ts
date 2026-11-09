import "server-only";
import { NextResponse } from "next/server";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import { sameOriginPost, readFields } from "@/lib/auth/security";
import { organizationAccess } from "@/lib/auth/access.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseAcademicForm, errorNotice, sectionFor, uuid } from "./forms";
import { isScheduleAction, scheduleMutation } from "@/features/schedule/schedule.server";
import { mutateAcademic, privatePdf } from "./data.server";
const failure = (status: number) =>
  NextResponse.json(
    { error: "No se pudo completar la operación." },
    { status, headers: noStoreHeaders },
  );
export async function academicPost(request: Request, slug: string) {
  const config = authConfig();
  if (!config) return failure(503);
  if (!sameOriginPost(request, config.origin)) return failure(403);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100)
    return failure(400);
  const access = await organizationAccess(slug, "admin");
  if (!access.allowed || !access.membership)
    return failure(access.session.status === "anonymous" ? 401 : 403);
  let section = "admin";
  let notice = "saved";
  let query = "";
  try {
    const fields = await readFields(request);
    const destinations: Record<string, string> = {
      course: "cursos",
      student: "alumnos",
      "student-status": "alumnos",
      enrollment: "matriculas",
      material: "materiales",
      announcement: "avisos",
      event: "calendario",
      "event-attendees": "calendario",
      attendance: "asistencia",
      "attendance-batch": "asistencia",
    };
    const submitted = fields.get("action") ?? "";
    if (isScheduleAction(submitted))
      return scheduleMutation(submitted, fields, access.membership.organizationId);
    if (Object.hasOwn(destinations, submitted))
      section = "admin/" + destinations[submitted];
    const command = parseAcademicForm(fields);
    section = "admin/" + sectionFor(command.kind);
    if (
      command.kind === "attendance-batch" &&
      uuid(fields.get("course_id") ?? "")
    )
      query =
        "?course=" +
        encodeURIComponent(fields.get("course_id")!) +
        "&event=" +
        encodeURIComponent(command.id);
    const client = await createServerSupabaseClient(true);
    await mutateAcademic(client, access.membership.organizationId, command);
  } catch (error) {
    notice = errorNotice(error);
  }
  return NextResponse.redirect(
    new URL(
      "/o/" + slug + "/" + section + query + (query ? "&" : "?") + "notice=" + notice,
      config.origin,
    ),
    { status: 303, headers: noStoreHeaders },
  );
}
export async function academicPdf(slug: string, id: string) {
  if (!authConfig()) return failure(503);
  if (!uuid(id)) return failure(404);
  let access = await organizationAccess(slug, "student");
  if (access.allowed && access.membership?.role === "admin")
    access = await organizationAccess(slug, "admin");
  if (!access.allowed || !access.membership) return failure(403);
  try {
    const file = await privatePdf(
      await createServerSupabaseClient(),
      access.membership.organizationId,
      id,
    );
    return new NextResponse(file.blob, {
      headers: {
        ...noStoreHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition":
          "attachment; filename*=UTF-8''" + encodeURIComponent(file.name),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return failure(404);
  }
}

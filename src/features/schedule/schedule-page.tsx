import { redirect } from "next/navigation";
import { PageHeading } from "@/components/ui/primitives";
import { AcademicShell } from "@/features/academic/shell";
import { noticeText } from "@/features/academic/forms";
import { ProtectedModule } from "@/features/auth/components/protected-module";
import { organizationAccess } from "@/lib/auth/access.server";
import { ScheduleBoard } from "./schedule-board";
import { loadSchedule, scheduleQuery } from "./schedule.server";
import type { ScheduleData } from "./model";

export type ScheduleSearch = Record<string, string | string[] | undefined>;
function toQuery(search: ScheduleSearch) {
  const params = new URLSearchParams();
  for (const key of ["date", "view", "course", "notice"]) {
    const value = search[key];
    if (typeof value === "string") params.set(key, value);
  }
  return params;
}
export function redirectCalendar(
  slug: string,
  admin: boolean,
  search: ScheduleSearch,
) {
  const query = toQuery(search).toString();
  redirect(
    "/o/" +
      encodeURIComponent(slug) +
      (admin ? "/admin" : "/dashboard") +
      "/horario" +
      (query ? "?" + query : ""),
  );
}
export async function SchedulePage({
  slug,
  admin,
  search,
}: {
  slug: string;
  admin: boolean;
  search: ScheduleSearch;
}) {
  const role = admin ? "admin" : "student";
  const title = admin ? "Horario" : "Mi horario";
  const section = admin ? "admin/horario" : "dashboard/horario";
  const access = await organizationAccess(slug, role);
  if (!access.allowed || !access.membership)
    return (
      <ProtectedModule
        slug={slug}
        role={role}
        title={title}
        section={section}
      />
    );

  const query = scheduleQuery(toQuery(search));
  let data: ScheduleData | null = null;
  try {
    data = await loadSchedule(access.membership.organizationId, admin, query);
  } catch {
    // La vista ofrece reintentar sin mostrar errores internos de PostgreSQL.
  }
  const notice =
    typeof search.notice === "string" &&
    Object.hasOwn(noticeText, search.notice)
      ? (noticeText[search.notice] ?? "")
      : "";
  return (
    <AcademicShell
      slug={slug}
      name={access.membership.name}
      admin={admin}
      section={section}
    >
      <PageHeading
        eyebrow={admin ? "ADMINISTRACIÓN" : "ESPACIO DEL ALUMNO"}
        title={title}
        description={
          admin
            ? "Organiza las sesiones académicas de tus talleres."
            : "Consulta las sesiones de los talleres donde tienes una matrícula activa."
        }
      />
      <ScheduleBoard
        slug={slug}
        admin={admin}
        initialQuery={query}
        initialData={data}
        initialNotice={notice}
      />
    </AcademicShell>
  );
}

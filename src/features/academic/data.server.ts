import "server-only";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { StaffModule } from "@/lib/authorization/staff";
import { AcademicError, type AcademicCommand } from "./forms";
export type AcademicClient = Awaited<
  ReturnType<typeof createServerSupabaseClient>
>;
export type AttendanceRecord = {
  id: string;
  organization_id: string;
  event_id: string;
  membership_id: string;
  status: "pending" | "present" | "absent" | "late";
};
type AnnouncementRow = {
  id: string;
  organization_id: string;
  course_id: string;
  title: string;
  body: string;
  status: string;
  published_at: string | null;
  row_version: number;
  image_url?: string | null;
  video_url?: string | null;
  image_asset_id?: string | null;
  video_asset_id?: string | null;
};
const checked = <T>(result: { data: T; error: unknown }): T => {
  if (result.error) throw result.error;
  return result.data;
};
const orgCourses = (client: AcademicClient, org: string) =>
  client
    .from("courses")
    .select("*")
    .eq("organization_id", org)
    .order("sort_order")
    .order("title")
    .limit(500);
const orgEnrollments = (client: AcademicClient, org: string) =>
  client
    .from("enrollments")
    .select("*")
    .eq("organization_id", org)
    .order("created_at", { ascending: false })
    .limit(500);
async function orgMaterials(client: AcademicClient, org: string) {
  const result = await client
    .from("materials")
    .select("*")
    .eq("organization_id", org)
    .order("sort_order")
    .order("title")
    .limit(500);
  return {
    ...result,
    data:
      result.data?.map((item) => ({
        ...item,
        external_url:
          item.external_url ??
          ("class_url" in item && typeof item.class_url === "string"
            ? item.class_url
            : null) ??
          ("recording_url" in item && typeof item.recording_url === "string"
            ? item.recording_url
            : null) ??
          ("help_url" in item && typeof item.help_url === "string"
            ? item.help_url
            : null),
      })) ?? null,
  };
}
const orgAnnouncements = (client: AcademicClient, org: string) =>
  client
    .from("announcements")
    .select("*")
    .eq("organization_id", org)
    .order("published_at", { ascending: false })
    .limit(500);
const readyPdfs = (client: AcademicClient, org: string) =>
  client
    .from("file_assets")
    .select("*")
    .eq("organization_id", org)
    .eq("purpose", "course_material")
    .eq("mime_type", "application/pdf")
    .eq("status", "ready")
    .limit(500);

export async function loadNextStudentSession(
  client: AcademicClient,
  org: string,
  membershipId: string,
  now = new Date(),
) {
  // Las relaciones internas aplican los mismos criterios de matrícula que Mi horario.
  const result = await client
    .from("calendar_events")
    .select("title,course_id,starts_at,ends_at,course:courses!calendar_events_organization_id_course_id_fkey!inner(title,enrollments!enrollments_organization_id_course_id_fkey!inner(membership_id))")
    .eq("organization_id", org)
    .eq("status", "scheduled")
    .eq("course.status", "published")
    .eq("course.enrollments.membership_id", membershipId)
    .eq("course.enrollments.status", "active")
    .gte("starts_at", now.toISOString())
    .order("starts_at")
    .order("id")
    .limit(1)
    .maybeSingle();
  return checked(result);
}

export type NextStudentSession = NonNullable<
  Awaited<ReturnType<typeof loadNextStudentSession>>
>;

export async function loadAcademic(client: AcademicClient, org: string) {
  const [
    courses,
    memberships,
    enrollments,
    materials,
    announcements,
    events,
    eventAttendees,
    attendance,
    files,
  ] = await Promise.all([
    orgCourses(client, org),
    client
      .from("organization_memberships")
      .select("*")
      .eq("organization_id", org)
      .order("first_name")
      .limit(500),
    orgEnrollments(client, org),
    orgMaterials(client, org),
    orgAnnouncements(client, org),
    client
      .from("calendar_events")
      .select("*")
      .eq("organization_id", org)
      .order("starts_at")
      .limit(500),
    client
      .from("calendar_event_attendees")
      .select("id,event_id,membership_id,status")
      .eq("organization_id", org)
      .eq("status", "active")
      .limit(2000),
    client
      .from("attendance_records")
      .select("*")
      .eq("organization_id", org)
      .limit(2000),
    readyPdfs(client, org),
  ]);
  const attendanceResult = await attendance;
  const attendanceError = attendanceResult.error as { code?: string } | null;
  const attendanceAvailable = !attendanceError;
  if (
    attendanceError &&
    attendanceError.code !== "PGRST205" &&
    attendanceError.code !== "42P01"
  )
    throw attendanceError;
  const attendanceRows = attendanceAvailable
    ? attendanceResult.data
    : (checked(eventAttendees) ?? []).map((attendee) => ({
        id: attendee.id,
        organization_id: org,
        event_id: attendee.event_id,
        membership_id: attendee.membership_id,
        status: "pending" as const,
      }));
  return {
    courses: checked(courses) ?? [],
    memberships: checked(memberships) ?? [],
    enrollments: checked(enrollments) ?? [],
    materials: checked(materials) ?? [],
    announcements: (checked(announcements) ?? []) as unknown as AnnouncementRow[],
    events: checked(events) ?? [],
    files: checked(files) ?? [],
    attendance: attendanceRows as unknown as AttendanceRecord[],
    attendanceAvailable,
  };
}

export async function loadStudentAcademic(
  client: AcademicClient,
  org: string,
  profileId: string,
  section: string,
  courseId: string | null,
): Promise<{
  data: Awaited<ReturnType<typeof loadAcademic>>;
  nextSession: NextStudentSession | null | undefined;
}> {
  const membership = checked(
    await client
      .from("organization_memberships")
      .select("*")
      .eq("organization_id", org)
      .eq("profile_id", profileId)
      .eq("role", "student")
      .maybeSingle(),
  );
  if (!membership) {
    return { data: {
      courses: [], memberships: [], enrollments: [], materials: [],
      announcements: [], events: [], files: [], attendance: [], attendanceAvailable: true,
    }, nextSession: null };
  }

  const nextSessionPromise = section === "dashboard"
    ? loadNextStudentSession(client, org, membership.id).catch(() => undefined)
    : Promise.resolve(null);

  const needsEnrollments = section !== "dashboard/perfil";
  const enrollments = needsEnrollments
    ? checked(
        await client
          .from("enrollments")
          .select("*")
          .eq("organization_id", org)
          .eq("membership_id", membership.id)
          .order("created_at", { ascending: false }),
      ) ?? []
    : [];
  const courseIds = [...new Set(enrollments.map((item) => item.course_id))];
  const requestedCourseId = courseId && courseIds.includes(courseId) ? courseId : null;
  const visibleCourseIds = requestedCourseId ? [requestedCourseId] : courseIds;
  const needsCourses = needsEnrollments;
  const [courses, materials, announcements] = await Promise.all([
    needsCourses && visibleCourseIds.length
      ? client.from("courses").select("*").eq("organization_id", org).in("id", visibleCourseIds).order("sort_order").order("title")
      : Promise.resolve({ data: [], error: null }),
    ["dashboard", "dashboard/materiales", "dashboard/cursos"].includes(section) && visibleCourseIds.length
      ? orgMaterialsForCourses(client, org, visibleCourseIds)
      : Promise.resolve({ data: [], error: null }),
    ["dashboard", "dashboard/avisos", "dashboard/cursos"].includes(section) && visibleCourseIds.length
      ? client.from("announcements").select("*").eq("organization_id", org).in("course_id", visibleCourseIds).order("published_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  let events: Awaited<ReturnType<typeof loadAcademic>>["events"] = [];
  let attendance: AttendanceRecord[] = [];
  let attendanceAvailable = true;
  if (section === "dashboard/asistencia") {
    const attendanceResult = await client
      .from("attendance_records")
      .select("*")
      .eq("organization_id", org)
      .eq("membership_id", membership.id)
      .limit(2000);
    const error = attendanceResult.error as { code?: string } | null;
    if (error && error.code !== "PGRST205" && error.code !== "42P01") throw error;
    attendanceAvailable = !error;
    attendance = error
      ? ((checked(await client.from("calendar_event_attendees").select("id,event_id,membership_id,status").eq("organization_id", org).eq("membership_id", membership.id).eq("status", "active").limit(2000)) ?? []).map((row) => ({ ...row, organization_id: org, status: "pending" as const })))
      : ((attendanceResult.data ?? []) as AttendanceRecord[]);
    const eventIds = [...new Set(attendance.map((row) => row.event_id))];
    if (eventIds.length) {
      events = checked(await client.from("calendar_events").select("*").eq("organization_id", org).in("id", eventIds)) ?? [];
      const attendanceCourseIds = [...new Set(events.map((event) => event.course_id))];
      const existing = new Set((courses.data ?? []).map((course) => course.id));
      const missingIds = attendanceCourseIds.filter((id) => !existing.has(id));
      if (missingIds.length) {
        const extra = checked(await client.from("courses").select("*").eq("organization_id", org).in("id", missingIds)) ?? [];
        courses.data = [...(courses.data ?? []), ...extra];
      }
    }
  }

  return { data: {
    courses: checked(courses) ?? [],
    memberships: [membership],
    enrollments,
    materials: checked(materials) ?? [],
    announcements: (checked(announcements) ?? []) as unknown as AnnouncementRow[],
    events,
    files: [],
    attendance,
    attendanceAvailable,
  }, nextSession: await nextSessionPromise };
}

async function orgMaterialsForCourses(client: AcademicClient, org: string, courseIds: string[]) {
  const result = await client
    .from("materials")
    .select("*")
    .eq("organization_id", org)
    .in("course_id", courseIds)
    .order("sort_order")
    .order("title")
    .limit(500);
  return {
    ...result,
    data: result.data?.map((item) => ({
      ...item,
      external_url: item.external_url ?? ("class_url" in item && typeof item.class_url === "string" ? item.class_url : null) ?? ("recording_url" in item && typeof item.recording_url === "string" ? item.recording_url : null) ?? ("help_url" in item && typeof item.help_url === "string" ? item.help_url : null),
    })) ?? null,
  };
}
type LoadedAcademicData = Awaited<ReturnType<typeof loadAcademic>>;
type CourseRow = LoadedAcademicData["courses"][number];
type MemberRow = LoadedAcademicData["memberships"][number];
type EnrollmentRow = LoadedAcademicData["enrollments"][number];
type EventRow = LoadedAcademicData["events"][number];
export type AcademicData = Omit<
  LoadedAcademicData,
  "courses" | "memberships" | "enrollments" | "events"
> & {
  courses: (Pick<CourseRow, "id" | "title" | "status"> &
    Partial<
      Pick<
        CourseRow,
        | "slug"
        | "description"
        | "tag"
        | "row_version"
        | "price_amount"
        | "currency"
      >
    >)[];
  memberships: (Pick<
    MemberRow,
    "id" | "first_name" | "last_name" | "role" | "status"
  > &
    Partial<
      Pick<
        MemberRow,
        "profile_id" | "contact_email" | "joined_at" | "row_version"
      >
    >)[];
  enrollments: (Pick<
    EnrollmentRow,
    "id" | "course_id" | "membership_id" | "status"
  > &
    Partial<
      Pick<EnrollmentRow, "enrolled_at" | "row_version" | "progress_percent">
    >)[];
  events: Pick<
    EventRow,
    "id" | "course_id" | "title" | "starts_at" | "ends_at" | "status"
  >[];
};

export async function loadAdminOverview(
  client: AcademicClient,
  org: string,
): Promise<AcademicData> {
  const [courses, memberships, enrollments] = await Promise.all([
    client.from("courses").select("id,title,status").eq("organization_id", org).order("sort_order").order("title").limit(500),
    client.from("organization_memberships").select("id,first_name,last_name,role,status").eq("organization_id", org).order("first_name").limit(500),
    client.from("enrollments").select("id,course_id,membership_id,status").eq("organization_id", org).order("created_at", { ascending: false }).limit(500),
  ]);
  return {
    courses: checked(courses) ?? [],
    memberships: checked(memberships) ?? [],
    enrollments: checked(enrollments) ?? [],
    materials: [],
    announcements: [],
    events: [],
    files: [],
    attendance: [],
    attendanceAvailable: true,
  };
}

type ModuleContext = Pick<
  AcademicData,
  "courses" | "memberships" | "enrollments" | "events"
> & {
  attendee_ids: string[];
};
export type AcademicStaffModule = Exclude<
  StaffModule,
  "schedule" | "certificates"
>;

async function loadModuleContext(
  client: AcademicClient,
  org: string,
  module: Exclude<StaffModule, "courses" | "certificates">,
  course: string | null,
) {
  return checked(
    await client.rpc("staff_academic_context", {
      p_org: org,
      p_module: module,
      p_course: course ?? "",
    }),
  ) as unknown as ModuleContext;
}

async function courseExists(client: AcademicClient, org: string, id: string) {
  const context = await loadModuleContext(client, org, "announcements", id);
  if (!context.courses.some((course) => course.id === id))
    throw new AcademicError("unavailable");
}

export async function loadStaffAcademic(
  client: AcademicClient,
  org: string,
  module: AcademicStaffModule,
  course: string | null,
): Promise<AcademicData> {
  const data: AcademicData = {
    courses: [],
    memberships: [],
    enrollments: [],
    events: [],
    materials: [],
    announcements: [],
    attendance: [],
    files: [],
    attendanceAvailable: true,
  };
  if (module === "courses") {
    data.courses = checked(await orgCourses(client, org)) ?? [];
    return data;
  }
  const context = await loadModuleContext(client, org, module, course);
  data.courses = context.courses;
  data.memberships = context.memberships;
  data.enrollments = context.enrollments;
  data.events = context.events;
  switch (module) {
    case "students":
      data.memberships =
        checked(
          await client
            .from("organization_memberships")
            .select(
              "id,first_name,last_name,role,status,contact_email,joined_at,row_version",
            )
            .eq("organization_id", org)
            .eq("role", "student")
            .order("first_name")
            .limit(500),
        ) ?? [];
      break;
    case "enrollments":
      data.enrollments = checked(await orgEnrollments(client, org)) ?? [];
      break;
    case "materials": {
      const [materials, files] = await Promise.all([
        orgMaterials(client, org),
        readyPdfs(client, org),
      ]);
      data.materials = checked(materials) ?? [];
      data.files = checked(files) ?? [];
      break;
    }
    case "announcements":
      data.announcements = checked(await orgAnnouncements(client, org)) ?? [];
      break;
    case "attendance":
      if (data.events.length) {
        data.attendance = (checked(
          await client
            .from("attendance_records")
            .select("*")
            .eq("organization_id", org)
            .in(
              "event_id",
              data.events.map(({ id }) => id),
            )
            .limit(2000),
        ) ?? []) as AttendanceRecord[];
      }
      break;
  }
  return data;
}
async function attendees(client: AcademicClient, org: string, course: string) {
  const { attendee_ids: ids } = await loadModuleContext(
    client,
    org,
    "schedule",
    course,
  );
  if (!ids.length) throw new AcademicError("attendees");
  return ids;
}
export async function mutateAcademic(
  client: AcademicClient,
  org: string,
  c: AcademicCommand,
) {
  const now = () => new Date().toISOString();
  const rpcArgs = (id: string, version: number) => ({
    p_organization_id: org,
    p_id: id,
    p_expected_version: version,
  });
  switch (c.kind) {
    case "course": {
      const patch = {
        title: c.title,
        description: c.description,
        tag: c.tag,
        status: c.status,
      };
      checked(
        c.id
          ? await client.rpc("update_course", {
              ...rpcArgs(c.id, c.version),
              p_patch: patch,
            })
          : await client
              .from("courses")
              .insert({ organization_id: org, slug: c.slug, ...patch }),
      );
      break;
    }
    case "student":
      checked(
        await client.rpc("update_student_contact", {
          ...rpcArgs(c.id, c.version),
          p_patch: {
            first_name: c.first_name,
            last_name: c.last_name,
            contact_email: c.contact_email,
          },
        }),
      );
      break;
    case "student-status":
      checked(
        await client.rpc("set_student_status", {
          ...rpcArgs(c.id, c.version),
          p_patch: { status: c.status },
        }),
      );
      break;
    case "enrollment": {
      if (c.id) {
        checked(
          await client.rpc("update_enrollment", {
            ...rpcArgs(c.id, c.version),
            p_patch: {
              status: c.status,
              progress_percent: c.progress_percent,
              completed_at: c.status === "completed" ? now() : null,
            },
          }),
        );
        break;
      }
      checked(
        await client.from("enrollments").insert({
          organization_id: org,
          course_id: c.course_id,
          membership_id: c.membership_id,
          status: "active",
          enrolled_at: now(),
          progress_percent: 0,
        }),
      );
      break;
    }
    case "material": {
      if (c.file_asset_id) {
        const asset = checked(
          await client
            .from("file_assets")
            .select("id")
            .eq("organization_id", org)
            .eq("course_id", c.course_id)
            .eq("id", c.file_asset_id)
            .eq("mime_type", "application/pdf")
            .eq("bucket_name", "course-files")
            .eq("purpose", "course_material")
            .eq("status", "ready")
            .maybeSingle(),
        );
        if (!asset) throw new AcademicError("pdf");
      }
      const patch = {
        title: c.title,
        status: c.status,
        external_url: null,
        class_url: c.class_url,
        recording_url: c.recording_url,
        help_url: c.help_url,
        file_asset_id: c.file_asset_id,
      };
      if (c.id) {
        if (
          !checked(
            await client
              .from("materials")
              .select("id")
              .eq("organization_id", org)
              .eq("course_id", c.course_id)
              .eq("id", c.id)
              .maybeSingle(),
          )
        )
          throw new AcademicError("unavailable");
        checked(
          await client.rpc("update_material", {
            ...rpcArgs(c.id, c.version),
            p_patch: patch,
          }),
        );
      } else
        checked(
          await client
            .from("materials")
            .insert({ organization_id: org, course_id: c.course_id, ...patch }),
        );
      break;
    }
    case "announcement": {
      await courseExists(client, org, c.course_id);
      const legacyPatch = {
        title: c.title,
        body: c.body,
        status: c.status,
        published_at: c.status === "published" ? now() : null,
      };
      const patch = {
        ...legacyPatch,
        image_url: null,
        video_url: null,
        image_asset_id: c.image_asset_id,
        video_asset_id: c.video_asset_id,
      };
      if (c.id) {
        const original = checked(
          await client
            .from("announcements")
            .select("published_at")
            .eq("organization_id", org)
            .eq("course_id", c.course_id)
            .eq("id", c.id)
            .maybeSingle(),
        );
        if (!original) throw new AcademicError("unavailable");
        if (c.status === "published" && original.published_at)
          patch.published_at = original.published_at;
        const result = await client.rpc("update_announcement", {
          ...rpcArgs(c.id, c.version),
          p_patch: patch,
        });
        const resultCode =
          result.error && "code" in result.error ? result.error.code : "";
        if (
          result.error &&
          ["42501", "PGRST202"].includes(String(resultCode)) &&
          !c.image_asset_id &&
          !c.video_asset_id
        ) {
          checked(
            await client.rpc("update_announcement", {
              ...rpcArgs(c.id, c.version),
              p_patch: legacyPatch,
            }),
          );
        } else if (
          result.error &&
          ["42501", "PGRST202"].includes(String(resultCode))
        ) {
          throw new AcademicError("media-migration");
        } else checked(result);
      } else
        {
          const result = await client
            .from("announcements")
            .insert({
              organization_id: org,
              course_id: c.course_id,
              ...legacyPatch,
              image_url: null,
              video_url: null,
              ...(c.image_asset_id ? { image_asset_id: c.image_asset_id } : {}),
              ...(c.video_asset_id ? { video_asset_id: c.video_asset_id } : {}),
            });
          const resultCode =
            result.error && "code" in result.error ? result.error.code : "";
          if (result.error && ["PGRST204", "42703"].includes(String(resultCode)))
            throw new AcademicError("media-migration");
          checked(result);
        }
      break;
    }
    case "delete-announcement": {
      const result = await client.rpc("delete_announcement", {
        ...rpcArgs(c.id, c.version),
      });
      if (result.error?.code === "PGRST202")
        throw new AcademicError("delete-migration");
      checked(result);
      break;
    }
    case "delete-material": {
      const result = await client.rpc("delete_material", {
        ...rpcArgs(c.id, c.version),
      });
      if (result.error?.code === "PGRST202")
        throw new AcademicError("delete-migration");
      checked(result);
      break;
    }
    case "event": {
      const patch = {
        title: c.title,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        timezone: "America/Lima",
      };
      if (c.id) {
        if (
          !checked(
            await client
              .from("calendar_events")
              .select("id")
              .eq("organization_id", org)
              .eq("course_id", c.course_id)
              .eq("id", c.id)
              .maybeSingle(),
          )
        )
          throw new AcademicError("unavailable");
        checked(
          await client.rpc("update_calendar_event", {
            ...rpcArgs(c.id, c.version),
            p_patch: { ...patch, status: c.status },
          }),
        );
      } else
        checked(
          await client.rpc("create_scheduled_event", {
            p_organization_id: org,
            p_event: { ...patch, course_id: c.course_id },
            p_membership_ids: await attendees(client, org, c.course_id),
          }),
        );
      break;
    }
    case "attendance": {
      const result = await client.rpc("set_attendance", {
        p_organization_id: org,
        p_event_id: c.id,
        p_membership_id: c.membership_id,
        p_status: c.status,
      });
      checked(result);
      break;
    }
    case "attendance-batch": {
      const result = await client.rpc("set_attendance_batch", {
        p_organization_id: org,
        p_event_id: c.id,
        p_records: c.records,
      });
      checked(result);
      break;
    }
    case "event-attendees": {
      const event = checked(
        await client
          .from("calendar_events")
          .select("course_id")
          .eq("organization_id", org)
          .eq("id", c.id)
          .maybeSingle(),
      );
      if (!event) throw new AcademicError("unavailable");
      checked(
        await client.rpc("replace_event_attendees", {
          p_organization_id: org,
          p_event_id: c.id,
          p_expected_version: c.version,
          p_membership_ids: await attendees(client, org, event.course_id),
        }),
      );
      break;
    }
  }
}
export async function privatePdf(
  client: AcademicClient,
  org: string,
  id: string,
) {
  const asset = checked(
    await client
      .from("file_assets")
      .select("bucket_name,object_path,original_name")
      .eq("organization_id", org)
      .eq("id", id)
      .eq("status", "ready")
      .eq("mime_type", "application/pdf")
      .eq("purpose", "course_material")
      .eq("bucket_name", "course-files")
      .maybeSingle(),
  );
  if (!asset) throw new AcademicError("unavailable");
  const blob = checked(
    await client.storage.from(asset.bucket_name).download(asset.object_path),
  );
  if (!blob) throw new AcademicError("unavailable");
  return { blob, name: asset.original_name };
}

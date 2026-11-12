import { NextResponse, type NextRequest } from "next/server";
import { organizationAccess } from "@/lib/auth/access.server";
import { noStoreHeaders } from "@/lib/supabase/config";
import type { OrganizationPageProps } from "@/types/routes";
import {
  loadSchedule,
  scheduleQuery,
} from "@/features/schedule/schedule.server";

export async function GET(
  request: NextRequest,
  { params }: OrganizationPageProps,
) {
  const { organizationSlug } = await params;
  const query = request.nextUrl.searchParams;
  const admin = query.get("scope") === "admin";
  const access = await organizationAccess(
    organizationSlug,
    admin ? "admin" : "student",
    "schedule",
  );
  if (!access.allowed || !access.membership) {
    const status =
      access.session.status === "anonymous"
        ? 401
        : access.session.status === "authenticated"
          ? 403
          : 503;
    return NextResponse.json(
      { error: "Horario no disponible." },
      { status, headers: noStoreHeaders },
    );
  }
  try {
    const data = await loadSchedule(
      access.membership.organizationId,
      admin,
      scheduleQuery(query),
    );
    return NextResponse.json(data, { headers: noStoreHeaders });
  } catch {
    return NextResponse.json(
      { error: "No se pudo cargar el horario." },
      { status: 503, headers: noStoreHeaders },
    );
  }
}

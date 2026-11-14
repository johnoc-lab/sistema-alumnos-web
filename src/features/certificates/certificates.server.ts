import "server-only";
import { NextResponse } from "next/server";
import { uuid } from "@/features/academic/forms";
import { organizationAccess } from "@/lib/auth/access.server";
import { readFields, sameOriginPost } from "@/lib/auth/security";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database.generated";
import { certificatePdf } from "./pdf";

export const certificateDate = (date: string) =>
  new Intl.DateTimeFormat("es-PE", {
    dateStyle: "long",
    timeZone: "America/Lima",
  }).format(new Date(date));

export function detailsFromSnapshot(
  snapshot: Json,
  issuedAt: string | null,
  serial: string,
) {
  if (
    !snapshot ||
    typeof snapshot !== "object" ||
    Array.isArray(snapshot) ||
    typeof snapshot.participant !== "string" ||
    typeof snapshot.course !== "string" ||
    !issuedAt ||
    !Number.isFinite(Date.parse(issuedAt))
  )
    return null;
  return {
    institution:
      typeof snapshot.institution === "string"
        ? snapshot.institution
        : "Sistema Alumnos",
    participant: snapshot.participant,
    course: snapshot.course,
    date: certificateDate(issuedAt),
    serial,
  };
}

const failure = (status: number) =>
  new NextResponse(null, { status, headers: noStoreHeaders });

export async function certificatePost(request: Request, slug: string) {
  const config = authConfig();
  if (!config) return failure(503);
  if (!sameOriginPost(request, config.origin)) return failure(403);
  try {
    const form = await readFields(request);
    const action = form.get("action");
    const id = form.get("id") ?? "";
    if (
      !uuid(id) ||
      form.getAll("action").length !== 1 ||
      form.getAll("id").length !== 1 ||
      (action !== "recommend" && action !== "approve" && action !== "reject")
    )
      return failure(400);
    const recommend = action === "recommend";
    const access = await organizationAccess(
      slug,
      "admin",
      recommend ? "certificates.recommend" : "certificates.approve",
    );
    if (
      !access.allowed ||
      !access.membership ||
      (recommend && access.membership.staffRank !== "teacher")
    )
      return failure(403);
    const client = await createServerSupabaseClient(true);
    const org = access.membership.organizationId;
    const result = recommend
      ? await client.rpc("recommend_certificate", {
          p_org: org,
          p_enrollment: id,
        })
      : await client.rpc("decide_certificate", {
          p_org: org,
          p_recommendation: id,
          p_approve: action === "approve",
        });
    if (result.error?.code === "42501") return failure(403);
    const notice =
      result.error?.code === "23505"
        ? "duplicate"
        : result.error
          ? "failed"
          : action === "recommend"
            ? "recommended"
            : action === "approve"
              ? "approved"
              : "rejected";
    const url = new URL(
      "/o/" + encodeURIComponent(slug) + "/admin/certificados",
      config.origin,
    );
    url.searchParams.set("notice", notice);
    return NextResponse.redirect(url, { status: 303, headers: noStoreHeaders });
  } catch {
    return failure(400);
  }
}

export async function certificateDownload(
  slug: string,
  id: string,
  inline: boolean,
) {
  if (!uuid(id)) return failure(404);
  try {
    const access = await organizationAccess(slug, "student");
    if (!access.allowed || !access.membership) return failure(404);
    const client = await createServerSupabaseClient();
    // La RLS verifica la membresía del titular, incluso si se conoce el UUID del certificado.
    const { data, error } = await client
      .from("certificate_issues")
      .select("snapshot,issued_at,serial")
      .eq("organization_id", access.membership.organizationId)
      .eq("id", id)
      .eq("status", "issued")
      .maybeSingle();
    const details =
      data && detailsFromSnapshot(data.snapshot, data.issued_at, data.serial);
    if (error || !details) return failure(404);
    return new NextResponse(
      new Blob([certificatePdf(details)], { type: "application/pdf" }),
      {
        headers: {
          ...noStoreHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition":
            (inline ? "inline" : "attachment") + '; filename="certificado.pdf"',
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch {
    return failure(404);
  }
}

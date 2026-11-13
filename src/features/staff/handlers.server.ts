import "server-only";
import { NextResponse } from "next/server";
import { organizationAccess } from "@/lib/auth/access.server";
import { readFields, sameOriginPost } from "@/lib/auth/security";
import {
  isStaffPermission,
  isStaffRank,
  validStaffPermissions,
} from "@/lib/authorization/staff";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { uuid } from "@/features/academic/forms";
import { registerStaff } from "./registration.server";

export async function staffPost(request: Request, slug: string) {
  const config = authConfig();
  if (!config) return denied(503);
  if (!sameOriginPost(request, config.origin)) return denied(403);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100)
    return denied(400);
  const access = await organizationAccess(slug, "admin", "staff.manage");
  if (!access.allowed || !access.membership) {
    return denied(access.session.status === "anonymous" ? 401 : 403);
  }

  let notice = "saved";
  try {
    const form = await readFields(request);
    const action = form.get("action");
    if (form.getAll("action").length !== 1) return denied(400);
    if (
      action === "register" ||
      action === "deliver" ||
      action === "cancel_registration"
    ) {
      const actor =
        access.session.status === "authenticated"
          ? access.session.identity
          : null;
      if (actor?.assuranceLevel !== "aal2") return denied(403);
      return registerStaff(
        form,
        access.membership.organizationId,
        slug,
        config.origin,
        actor,
      );
    }
    const id = form.get("id") ?? "";
    const rank = form.get("rank");
    const modules = form.getAll("module");
    const status = form.get("status");
    const version = Number(form.get("version"));
    if (
      (action !== "link" && action !== "update") ||
      !uuid(id) ||
      !isStaffRank(rank) ||
      !modules.every(isStaffPermission) ||
      !validStaffPermissions(rank, modules) ||
      (status !== "active" && status !== "suspended") ||
      (action === "update" &&
        (!Number.isSafeInteger(version) || version < 1)) ||
      ["action", "id", "rank", "status", "version"].some(
        (field) => form.getAll(field).length > 1,
      )
    )
      return denied(400);

    const client = await createServerSupabaseClient(true);
    const args = {
      p_org: access.membership.organizationId,
      p_rank: rank,
      p_modules: modules,
      p_status: status,
    };
    const result =
      action === "link"
        ? await client.rpc("link_staff", { ...args, p_assignment: id })
        : await client.rpc("update_staff", {
            ...args,
            p_membership: id,
            p_version: version,
          });
    if (result.error) {
      if (result.error.code === "42501") return denied(403);
      notice = result.error.code === "40001" ? "stale" : "failed";
    } else if (action === "link") {
      notice = "linked";
    }
  } catch {
    return denied(400);
  }
  const url = new URL(
    "/o/" + encodeURIComponent(slug) + "/admin/administradores",
    config.origin,
  );
  url.searchParams.set("notice", notice);
  return NextResponse.redirect(url, { status: 303, headers: noStoreHeaders });
}

function denied(status: number) {
  return NextResponse.json(
    { error: "No se pudo completar la gestión del personal." },
    {
      status,
      headers: noStoreHeaders,
    },
  );
}

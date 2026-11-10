import { NextResponse } from "next/server";
import { organizationAccess } from "@/lib/auth/access.server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { noStoreHeaders } from "@/lib/supabase/config";
import { uuid } from "@/features/academic/forms";

export async function GET(_request: Request, { params }: { params: Promise<{ organizationSlug: string; assetId: string }> }) {
  const { organizationSlug, assetId } = await params;
  if (!uuid(assetId)) return new NextResponse(null, { status: 404, headers: noStoreHeaders });
  const admin = await organizationAccess(organizationSlug, "admin");
  const student = admin.allowed ? null : await organizationAccess(organizationSlug, "student");
  const access = admin.allowed ? admin : student;
  if (!access?.allowed || !access.membership) return new NextResponse(null, { status: 404, headers: noStoreHeaders });
  const client = await createServerSupabaseClient();
  const { data: asset, error } = await (client as any).from("file_assets")
    .select("bucket_name,object_path,purpose,status,mime_type")
    .eq("organization_id", access.membership.organizationId).eq("id", assetId).maybeSingle();
  if (error || !asset || asset.status !== "ready" || !["announcement_image", "announcement_video"].includes(asset.purpose))
    return new NextResponse(null, { status: 404, headers: noStoreHeaders });
  const { data, error: signedError } = await client.storage.from(asset.bucket_name).createSignedUrl(asset.object_path, 300);
  if (signedError || !data?.signedUrl) return new NextResponse(null, { status: 404, headers: noStoreHeaders });
  const upstream = await fetch(data.signedUrl, {
    cache: "no-store",
    headers: _request.headers.get("range") ? { range: _request.headers.get("range")! } : undefined,
  });
  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 416)
    return new NextResponse(null, { status: 404, headers: noStoreHeaders });
  const headers = new Headers(noStoreHeaders);
  headers.set("Content-Type", asset.mime_type);
  headers.set("Content-Disposition", "inline");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Accept-Ranges", "bytes");
  for (const name of ["content-length", "content-range"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

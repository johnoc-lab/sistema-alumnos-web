import { NextResponse } from "next/server";
import { organizationAccess } from "@/lib/auth/access.server";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sameOriginPost } from "@/lib/auth/security";
import { uuid } from "@/features/academic/forms";

const response = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: noStoreHeaders });
export async function POST(request: Request, { params }: { params: Promise<{ organizationSlug: string }> }) {
  const { organizationSlug } = await params;
  const config = authConfig();
  if (!config) return response({ error: "La integración no está disponible." }, 503);
  if (!sameOriginPost(request, config.origin)) return response({ error: "Solicitud no válida." }, 403);
  const access = await organizationAccess(organizationSlug, "admin");
  if (!access.allowed || !access.membership) return response({ error: "No autorizado." }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > 6000) return response({ error: "Solicitud demasiado grande." }, 413);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return response({ error: "Solicitud inválida." }, 400); }
  const client = await createServerSupabaseClient(true);
  if (body.action === "prepare") {
    if (!uuid(String(body.courseId ?? "")) || !["image", "video", "pdf"].includes(String(body.kind)) ||
      typeof body.name !== "string" || body.name.length > 200 || typeof body.mime !== "string" ||
      typeof body.size !== "number" || !Number.isSafeInteger(body.size)) return response({ error: "Datos del archivo inválidos." }, 400);
    const result = await (client as any).rpc("prepare_announcement_media", {
      p_organization_id: access.membership.organizationId, p_course_id: body.courseId,
      p_purpose: body.kind === "image" ? "announcement_image" : body.kind === "video" ? "announcement_video" : "course_material",
      p_original_name: body.name, p_mime_type: body.mime, p_size_bytes: body.size,
    });
    if (result.error) return response({ error: "No se pudo preparar la carga. Verifica que la migración esté aplicada y el formato sea válido." }, 400);
    return response(result.data);
  }
  if (body.action === "finalize") {
    if (!uuid(String(body.assetId ?? "")) || typeof body.size !== "number" || !Number.isSafeInteger(body.size) ||
      typeof body.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(body.sha256)) return response({ error: "Datos de carga inválidos." }, 400);
    const result = await (client as any).rpc("finalize_announcement_media", {
      p_organization_id: access.membership.organizationId, p_asset_id: body.assetId,
      p_size_bytes: body.size, p_sha256: body.sha256,
    });
    if (result.error) return response({ error: "No se pudo verificar el archivo cargado." }, 400);
    return response({ ok: true });
  }
  return response({ error: "Acción no válida." }, 400);
}

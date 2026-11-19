import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { uuid } from "@/features/academic/forms";
import { organizationAccess } from "@/lib/auth/access.server";
import { readFields, sameOriginPost } from "@/lib/auth/security";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  studentAccessDigest,
  studentInstitutions,
} from "./student-registration.server";

export async function studentAccessManagementPost(
  request: Request,
  slug: string,
) {
  const denied = (status: number) =>
    NextResponse.json(
      { error: "No se pudo completar la solicitud." },
      { status, headers: noStoreHeaders },
    );
  const config = authConfig();
  if (!config) return denied(503);
  if (!sameOriginPost(request, config.origin)) return denied(403);
  if (!Object.hasOwn(studentInstitutions, slug)) return denied(404);
  const access = await organizationAccess(slug, "admin", "student_access");
  if (!access.allowed || !access.membership) return denied(403);
  const org = access.membership.organizationId;
  const back =
    "/o/" + encodeURIComponent(slug) + "/admin/autorizaciones-alumnos";

  try {
    const fields = await readFields(request);
    const field = (name: string) =>
      fields.getAll(name).length === 1 ? (fields.get(name) ?? "") : "";
    const action = field("action");
    const client = await createServerSupabaseClient(true);
    if (action === "revoke") {
      const id = field("id");
      if (!uuid(id)) return denied(400);
      const revoked = await client.rpc("revoke_student_access", {
        p_org: org,
        p_id: id,
      });
      if (revoked.error || !revoked.data) return denied(409);
      return NextResponse.redirect(new URL(back, config.origin), {
        status: 303,
        headers: noStoreHeaders,
      });
    }
    const recipient = field("recipient").trim().toLowerCase();
    const evidence = field("evidence").trim();
    const reissue = action === "reissue";
    const oldId = field("id");
    if (
      (action !== "enroll" && action !== "recover" && !reissue) ||
      (reissue
        ? !uuid(oldId)
        : !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(recipient)) ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/.test(evidence) ||
      field("verified") !== "yes"
    )
      return denied(400);
    const id = reissue ? oldId : randomUUID();
    const code = randomBytes(24).toString("base64url");
    const proof = randomBytes(24).toString("base64url");
    const payload = {
      p_org: org,
      p_id: id,
      p_evidence: evidence,
      p_code: studentAccessDigest(code),
      p_proof: studentAccessDigest(proof),
    };
    const issued = reissue
      ? await client.rpc("reissue_student_access", payload)
      : await client.rpc("issue_student_access", {
          ...payload,
          p_purpose: action,
          p_recipient: recipient,
        });
    if (issued.error || issued.data !== true) return denied(409);
    // Only generated URL-safe secrets and the validated organization slug enter the template.
    return new NextResponse(
      '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        "<title>Autorización emitida</title><main><h1>Autorización emitida</h1>" +
        "<p>El código y la prueba se muestran una sola vez. Cada autorización es temporal y sirve para completar una única operación.</p>" +
        "<ol><li>Entrega el código únicamente al alumno cuya identidad comprobaste en el padrón institucional.</li>" +
        "<li>Envía la prueba por separado, a través del canal privado que ya confirmaste con ese alumno.</li>" +
        "<li>Indícale que seleccione su institución e introduzca ambos en el formulario de inscripción o recuperación correspondiente.</li></ol>" +
        "<p>La inscripción caduca en 24 horas y la recuperación, en 15 minutos.</p>" +
        "<h2>Código para el alumno</h2><p><code>" +
        id +
        "." +
        code +
        "</code></p><h2>Prueba del canal verificado</h2><p><code>" +
        proof +
        "</code></p>" +
        '<a href="' +
        back +
        '">Volver a las autorizaciones</a></main></html>',
      {
        headers: {
          ...noStoreHeaders,
          "Content-Type": "text/html; charset=utf-8",
          "Content-Security-Policy":
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch {
    return denied(400);
  }
}

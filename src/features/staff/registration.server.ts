import "server-only";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { uuid } from "@/features/academic/forms";
import { readFields, sameOriginPost } from "@/lib/auth/security";
import {
  isStaffPermission,
  isStaffRank,
  validStaffPermissions,
} from "@/lib/authorization/staff";
import type { VerifiedIdentity } from "@/lib/authorization/access";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createStaffAdminClient } from "@/lib/supabase/staff-admin.server";

const activationPage = "/auth/activar-personal";
const validIdentifier = (value: string) =>
  value.length <= 254 &&
  /^u-[a-z0-9]+@cuentas\.sistema-alumnos\.invalid$/.test(value);
const digest = (code: string) =>
  createHash("sha256").update(code).digest("hex");

function activationNetwork(request: Request, secret: string) {
  // Vercel escribe este encabezado en el perímetro. En local y otros hosts no hay una IP confiable.
  if (
    process.env.VERCEL !== "1" ||
    (process.env.VERCEL_ENV !== "production" &&
      process.env.VERCEL_ENV !== "preview")
  )
    return "";
  const ip = request.headers.get("x-vercel-forwarded-for")?.trim() ?? "";
  const family = isIP(ip);
  if (!family || ip.includes("%")) return "";
  const normalized =
    family === 6 ? new URL("http://[" + ip + "]").hostname : ip;
  return createHmac("sha256", secret)
    .update("staff-activation-network:" + normalized)
    .digest("hex");
}

function field(form: URLSearchParams, name: string) {
  const values = form.getAll(name);
  return values.length === 1 ? values[0]! : "";
}

function redirect(path: string, origin: string, notice: string) {
  const url = new URL(path, origin);
  url.searchParams.set("notice", notice);
  return NextResponse.redirect(url, { status: 303, headers: noStoreHeaders });
}

function denied(status: number) {
  return NextResponse.json(
    { error: "No se pudo completar la operación." },
    {
      status,
      headers: noStoreHeaders,
    },
  );
}

function deliveryPage(code: string, back: string) {
  // El código es base64url generado localmente y back usa un slug validado.
  return new NextResponse(
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>Código de activación del personal</title>" +
      "<style>body{font:1rem system-ui;color:#192e3c;margin:0;padding:1rem}main{max-width:38rem;margin:2rem auto}" +
      "code{display:block;background:#edf5f3;padding:1rem;overflow-wrap:anywhere}a{color:#09685f}</style></head>" +
      "<body><main><h1>Código de activación</h1>" +
      "<p>Entrega este código únicamente al titular por el canal privado acordado. Caduca en una hora y se muestra una sola vez.</p>" +
      "<code>" +
      code +
      "</code>" +
      '<p>Indícale que abra <a href="' +
      activationPage +
      '">Activar cuenta de personal</a> e introduzca su identificador y el código.</p>' +
      '<a href="' +
      back +
      '">Volver a Administradores</a></main></body></html>',
    {
      headers: {
        ...noStoreHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

/** Invocado únicamente después de comprobar sesión, CSRF y staff.manage. Las RPC vuelven a autorizar. */
export async function registerStaff(
  form: URLSearchParams,
  org: string,
  slug: string,
  origin: string,
  actor: VerifiedIdentity,
) {
  const admin = createStaffAdminClient();
  if (!admin) return denied(503);
  const back = "/o/" + encodeURIComponent(slug) + "/admin/administradores";
  const action = field(form, "action");
  let registration = field(form, "id");

  try {
    const client = await createServerSupabaseClient(true);
    if (action === "register") {
      const identifier = field(form, "identifier").trim().toLowerCase();
      const firstName = field(form, "first_name").trim();
      const lastName = field(form, "last_name").trim();
      const rank = field(form, "rank");
      const modules = form.getAll("module");
      if (
        !validIdentifier(identifier) ||
        !firstName ||
        firstName.length > 100 ||
        !lastName ||
        lastName.length > 100 ||
        field(form, "assignment") !== "confirmed" ||
        !isStaffRank(rank) ||
        rank === "principal" ||
        !modules.every(isStaffPermission) ||
        modules.some((module) => module.startsWith("certificates")) ||
        !validStaffPermissions(rank, modules)
      )
        return denied(400);
      const result = await admin.rpc("reserve_staff_registration", {
        p_org: org,
        p_actor: actor.profileId,
        p_aal: actor.assuranceLevel,
        p_identifier: identifier,
        p_first_name: firstName,
        p_last_name: lastName,
        p_rank: rank,
        p_modules: modules,
      });
      if (result.error?.code === "42501") return denied(403);
      if (result.error?.code === "23505")
        return redirect(back, origin, "staff_duplicate");
      if (result.error?.code === "54000")
        return redirect(back, origin, "staff_rate_limited");
      if (result.error || !uuid(result.data ?? ""))
        return redirect(back, origin, "staff_pending");
      registration = result.data!;
    } else {
      if (!uuid(registration)) return denied(400);
      if (action === "cancel_registration") {
        const cancelled = await client.rpc("cancel_staff_registration", {
          p_org: org,
          p_registration: registration,
        });
        if (cancelled.error?.code === "42501") return denied(403);
        return redirect(
          back,
          origin,
          cancelled.data ? "staff_cancelled" : "staff_pending",
        );
      }
      if (action !== "deliver") return denied(400);
    }

    const context = await client.rpc("staff_registration_delivery", {
      p_org: org,
      p_registration: registration,
    });
    if (context.error?.code === "42501") return denied(403);
    const data = context.data;
    if (
      context.error ||
      !data ||
      typeof data !== "object" ||
      Array.isArray(data) ||
      typeof data.identifier !== "string" ||
      !validIdentifier(data.identifier) ||
      typeof data.actor !== "string" ||
      !uuid(data.actor)
    ) {
      return redirect(back, origin, "staff_pending");
    }

    if (typeof data.claim === "string" && uuid(data.claim)) {
      const completion = await admin.rpc("finish_staff_activation", {
        p_registration: registration,
        p_claim: data.claim,
        p_rejected: false,
      });
      return redirect(
        back,
        origin,
        completion.data === true ? "staff_activated" : "staff_review",
      );
    }
    if (data.claim !== null || typeof data.authReady !== "boolean")
      return redirect(back, origin, "staff_pending");

    if (!data.authReady) {
      const created = await admin.auth.admin.createUser({
        email: data.identifier,
        email_confirm: true,
        password: randomBytes(36).toString("base64url"),
        app_metadata: { staff_registration_id: registration },
      });
      if (created.error) return redirect(back, origin, "staff_pending");
    }

    const code = randomBytes(32).toString("base64url");
    const issued = await admin.rpc("issue_staff_activation", {
      p_org: org,
      p_registration: registration,
      p_actor: data.actor,
      p_digest: digest(code),
    });
    return issued.data === true
      ? deliveryPage(code, back)
      : redirect(back, origin, "staff_pending");
  } catch {
    // Los errores del proveedor pueden incluir datos personales. La UI usa avisos fijos.
    return redirect(back, origin, "staff_pending");
  }
}

export async function activateStaff(request: Request) {
  const config = authConfig();
  if (!config) return denied(503);
  if (!sameOriginPost(request, config.origin)) return denied(403);
  const admin = createStaffAdminClient();
  if (!admin) return denied(503);
  try {
    const form = await readFields(request);
    const identifier = field(form, "identifier").trim().toLowerCase();
    const code = field(form, "code").trim();
    const password = field(form, "password");
    if (
      !validIdentifier(identifier) ||
      !/^[A-Za-z0-9_-]{43}$/.test(code) ||
      password.length < 12 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      password !== field(form, "confirmation")
    ) {
      return redirect(activationPage, config.origin, "invalid");
    }
    const claim = randomUUID();
    const result = await admin.rpc("claim_staff_activation", {
      p_identifier: identifier,
      p_digest: digest(code),
      p_claim: claim,
      p_network: activationNetwork(request, config.secret),
    });
    const target = result.data;
    if (
      result.error ||
      !target ||
      typeof target !== "object" ||
      Array.isArray(target) ||
      typeof target.registration !== "string" ||
      !uuid(target.registration) ||
      typeof target.authUser !== "string" ||
      !uuid(target.authUser)
    ) {
      return redirect(activationPage, config.origin, "invalid");
    }

    const updated = await admin.auth.admin.updateUserById(target.authUser, {
      password,
      app_metadata: { staff_activation_claim: claim },
    });
    const rejected =
      updated.error?.code === "weak_password" &&
      (updated.error.status === 400 || updated.error.status === 422);
    // Para un fallo incierto solo se concilia el marcador. El código reclamado jamás se emite de nuevo.
    const completed = await admin.rpc("finish_staff_activation", {
      p_registration: target.registration,
      p_claim: claim,
      p_rejected: rejected,
    });
    return completed.data === true
      ? redirect("/login", config.origin, "password_updated")
      : redirect(activationPage, config.origin, "pending");
  } catch {
    return redirect(activationPage, config.origin, "pending");
  }
}

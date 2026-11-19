import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readFields, sameOriginPost } from "@/lib/auth/security";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import {
  resolveStaffIdentifier,
  staffUsernameFromIdentifier,
} from "@/features/staff/identifier";
import { uuid } from "@/features/academic/forms";
import type { Database } from "@/types/database.generated";
import { staffActivationNetwork } from "@/features/staff/registration.server";

export const studentInstitutions = {
  "impulso-cero": "Impulso Cero",
  incubadora: "Incubadora",
} as const;

export const studentAccessDigest = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function studentRegistrationConfig() {
  const auth = authConfig();
  const adminKey = process.env.SUPABASE_STUDENT_SECRET_KEY;
  if (
    process.env.STUDENT_REGISTRATION_ENABLED !== "true" ||
    !auth ||
    !adminKey ||
    !/^sb_secret_[A-Za-z0-9_-]{20,}$/.test(adminKey)
  )
    return null;
  return { ...auth, adminKey };
}

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      }),
  },
};

function validName(name: string) {
  return name.length > 0 && name.length <= 100 && !/\p{Cc}/u.test(name);
}

function confirmation(username: string) {
  // The interpolated username comes only from the ASCII institutional identifier parser.
  return new NextResponse(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>Cuenta creada</title><main><h1>Tu cuenta está lista</h1><p>Tu usuario de acceso es <strong>" +
      username +
      "</strong>.</p><p>Úsalo para iniciar sesión. Puedes consultar tu identificador completo en Mi perfil.</p>" +
      '<a href="/login">Iniciar sesión</a></main></html>',
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
}

export function registerStudent(request: Request) {
  return studentAccessPost(request, "enroll");
}
export function recoverStudent(request: Request) {
  return studentAccessPost(request, "recover");
}

async function studentAccessPost(
  request: Request,
  purpose: "enroll" | "recover",
) {
  const config = studentRegistrationConfig();
  if (!config)
    return NextResponse.json(
      { error: "Operación no disponible." },
      { status: 503, headers: noStoreHeaders },
    );
  if (!sameOriginPost(request, config.origin))
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403, headers: noStoreHeaders },
    );

  const path =
    purpose === "enroll" ? "/auth/crear-cuenta" : "/auth/recuperar-alumno";
  const go = (destination: string) =>
    NextResponse.redirect(new URL(destination, config.origin), {
      status: 303,
      headers: noStoreHeaders,
    });
  let failureNotice = "unavailable";
  const rejected = () => go(path + "?notice=" + failureNotice);

  try {
    const fields = await readFields(request);
    const known = ["organization", "code", "proof", "password", "confirmation"];
    if (purpose === "enroll") known.push("first_name", "last_name", "username");
    if (
      [...fields.keys()].some((field) => !known.includes(field)) ||
      known.some((field) => fields.getAll(field).length !== 1)
    )
      return go(path + "?notice=invalid");

    const slug = fields.get("organization") ?? "";
    const password = fields.get("password") ?? "";
    const code = fields.get("code")?.trim() ?? "";
    const proof = fields.get("proof")?.trim() ?? "";
    const [id, value, extra] = code.split(".");
    const first = fields.get("first_name")?.trim() ?? "";
    const last = fields.get("last_name")?.trim() ?? "";
    const rawUsername = fields.get("username")?.trim() ?? "";
    const identifier = /^[A-Za-z0-9]+$/.test(rawUsername)
      ? resolveStaffIdentifier(rawUsername)
      : null;
    if (
      !Object.hasOwn(studentInstitutions, slug) ||
      !uuid(id ?? "") ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]{32}$/.test(value ?? "") ||
      !/^[A-Za-z0-9_-]{32}$/.test(proof) ||
      password.length < 12 ||
      Buffer.byteLength(password, "utf8") > 72 ||
      password.includes("\0") ||
      password !== fields.get("confirmation") ||
      (purpose === "enroll" &&
        (!identifier || !validName(first) || !validName(last)))
    )
      return go(path + "?notice=invalid");

    const admin = createClient<Database>(
      config.url,
      config.adminKey,
      clientOptions,
    );
    const claim = await admin.rpc("claim_student_access", {
      p_id: id!,
      p_slug: slug,
      p_purpose: purpose,
      p_code: studentAccessDigest(value!),
      p_proof: studentAccessDigest(proof),
      p_identifier: identifier ?? "",
      p_network: staffActivationNetwork(request, config.secret),
    });
    const target = claim.data;
    if (
      claim.error ||
      !target ||
      typeof target !== "object" ||
      Array.isArray(target) ||
      target.id !== id ||
      typeof target.attemptId !== "string" ||
      !uuid(target.attemptId) ||
      typeof target.identifier !== "string"
    )
      return rejected();
    const email = target.identifier;
    const username = staffUsernameFromIdentifier(email);
    if (!username || (purpose === "enroll" && email !== identifier))
      return rejected();
    let authUserId =
      typeof target.authUserId === "string" ? target.authUserId : null;

    const attempt = target.attemptId;
    let phase = target.phase;
    if (phase === "password_pending") {
      failureNotice = "password_pending";
      return rejected();
    }
    if (phase === "create_account") {
      if (purpose !== "enroll" || authUserId) return rejected();
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { student_access_authorization: id },
      });
      if (error || !data.user) return rejected();
      authUserId = data.user.id;
    } else {
      if (!authUserId || !uuid(authUserId)) return rejected();
      const actorId = authUserId;
      const record = async (stage: string) => {
        const result = await admin.rpc("record_student_access_progress", {
          p_id: id!,
          p_attempt: attempt,
          p_auth: actorId,
          p_stage: stage,
        });
        return !result.error && result.data === true;
      };
      if (phase === "update_password") {
        failureNotice = "password_pending";
        const updated = await admin.auth.admin.updateUserById(actorId, {
          password,
          app_metadata: { student_access_password_attempt: attempt },
        });
        if (updated.error) {
          if (
            updated.error.code === "weak_password" &&
            (updated.error.status === 400 || updated.error.status === 422) &&
            (await record("password_rejected"))
          ) {
            failureNotice = "password_rejected";
          }
          return rejected();
        }
        failureNotice = "revocation_pending";
        if (!(await record("password_changed"))) return rejected();
        phase = "revoke_sessions";
      }
      if (phase === "revoke_sessions") {
        failureNotice = "revocation_pending";
        // Auth needs a fresh JWT for the same identity, so the retry uses the
        // password already set. It never sends another password update.
        const session = await createClient(
          config.url,
          config.key,
          clientOptions,
        ).auth.signInWithPassword({ email, password });
        if (
          session.error ||
          session.data.user?.id !== actorId ||
          !session.data.session
        )
          return rejected();
        const revoked = await admin.auth.admin.signOut(
          session.data.session.access_token,
          "global",
        );
        if (revoked.error || !(await record("sessions_revoked")))
          return rejected();
        phase = "finalize";
      }
      if (phase !== "finalize") return rejected();
      failureNotice = "completion_pending";
    }
    if (!authUserId || !uuid(authUserId)) return rejected();
    const result = await admin.rpc("finalize_student_access", {
      p_id: id!,
      p_attempt: attempt,
      p_auth: authUserId,
      p_first: first,
      p_last: last,
    });
    if (result.error || result.data !== true) return rejected();
    return purpose === "enroll"
      ? confirmation(username)
      : go("/login?notice=password_updated");
  } catch {
    return rejected();
  }
}

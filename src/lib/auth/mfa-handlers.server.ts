import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readFields, sameOriginPost } from "./security";
import {
  mfaContext,
  ownTotpFactors,
  factorIdValid,
  privateQrDataUri,
} from "./mfa.server";
import { mfaCookie, makeMfaProof, readMfaProof } from "./mfa-proof.server";
import { enrollmentHtml, challengeHtml } from "./mfa-html";
import { enrollmentDiagnostics } from "./mfa-diagnostics.server";
export type MfaAction = "enroll" | "challenge" | "verify" | "cancel";
const failure = (status: number) =>
  NextResponse.json(
    {
      error:
        status === 403
          ? "Acceso no permitido."
          : status === 401
            ? "Se requiere una sesión válida."
            : "No se pudo completar la verificación MFA.",
    },
    { status, headers: noStoreHeaders },
  );
const html = (body: string) =>
  new NextResponse(body, {
    status: 200,
    headers: {
      ...noStoreHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Referrer-Policy": "strict-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
export async function mfaPost(request: Request, action: MfaAction) {
  const diagnostic = enrollmentDiagnostics(action === "enroll");
  diagnostic.at("configuration");
  const config = authConfig();
  if (!config) {
    diagnostic.fail("configuration_unavailable");
    return failure(503);
  }
  diagnostic.ok();
  diagnostic.at("csrf");
  if (!sameOriginPost(request, config.origin)) {
    diagnostic.fail("csrf_rejected");
    return failure(403);
  }
  diagnostic.ok();
  const go = (path: string) =>
    NextResponse.redirect(new URL(path, config.origin), {
      status: 303,
      headers: noStoreHeaders,
    });
  try {
    let fields: URLSearchParams;
    diagnostic.at("form");
    try {
      fields = await readFields(request);
    } catch {
      diagnostic.fail("invalid_form");
      return failure(400);
    }
    diagnostic.ok();
    diagnostic.at("cookies");
    const jar = await cookies();
    diagnostic.ok();
    const clear = () =>
      jar.set(mfaCookie, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: config.origin.startsWith("https:"),
        path: "/auth/mfa",
        maxAge: 0,
      });
    const factorId = fields.get("factor_id"),
      challengeId = fields.get("challenge_id");
    const code = fields.get("code");
    const proof =
      action === "verify"
        ? readMfaProof(jar.get(mfaCookie)?.value, config.secret)
        : null;
    if (action === "verify" && !proof) {
      clear();
      return go("/auth/mfa?notice=expired");
    }
    if (
      action !== "enroll" &&
      (!factorIdValid(factorId) ||
        (action === "cancel" && fields.getAll("factor_id").length !== 1) ||
        (action === "verify" &&
          (!factorIdValid(challengeId) || !code || !/^[0-9]{6}$/.test(code))))
    ) {
      clear();
      return go("/auth/mfa?notice=invalid");
    }
    diagnostic.at("client");
    const client = await createServerSupabaseClient(true);
    diagnostic.ok();
    const context = await mfaContext(
      client,
      proof?.organization_id,
      diagnostic.at,
    );
    if (context.status !== "ready") {
      diagnostic.fail(
        context.status === "anonymous"
          ? "context_anonymous"
          : context.status === "forbidden"
            ? "context_forbidden"
            : "context_unavailable",
      );
      return failure(
        context.status === "anonymous"
          ? 401
          : context.status === "forbidden"
            ? 403
            : 503,
      );
    }
    diagnostic.ok();
    if (
      proof &&
      (proof.sub !== context.sub ||
        proof.session_id !== context.session_id ||
        proof.profile_id !== context.profile_id ||
        proof.organization_id !== context.organization_id ||
        proof.factor_id !== factorId ||
        proof.challenge_id !== challengeId)
    ) {
      clear();
      return failure(403);
    }
    diagnostic.at("list_factors");
    const factors = await ownTotpFactors(client, (error) =>
      diagnostic.fail("factor_list_failed", error),
    );
    diagnostic.ok();
    if (action === "enroll") {
      if (factors.length) {
        diagnostic.stop("existing_factor");
        return go("/auth/mfa?notice=exists");
      }
      diagnostic.at("challenge_state_clear");
      clear();
      diagnostic.ok();
      diagnostic.calling();
      diagnostic.at("auth_enroll");
      const { data, error } = await client.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Autenticador personal",
        issuer: "SistemaAlumnos-Web",
      });
      diagnostic.returned();
      diagnostic.at("enroll_response");
      if (error) {
        diagnostic.fail("provider_error", error);
        return failure(503);
      }
      if (!data || data.type !== "totp" || !factorIdValid(data.id)) {
        diagnostic.fail("invalid_enroll_response");
        return failure(503);
      }
      diagnostic.ok();
      diagnostic.at("qr_receive");
      const rawQr = data.totp.qr_code;
      diagnostic.ok();
      diagnostic.at("qr_validation");
      const qr = privateQrDataUri(rawQr, (reason) => diagnostic.fail(reason));
      if (!qr) return failure(503);
      diagnostic.ok();
      diagnostic.at("html_render");
      const body = enrollmentHtml(qr, data.id);
      diagnostic.ok();
      diagnostic.at("http_response");
      const response = html(body);
      diagnostic.ok();
      return response;
    }
    const factor = factors.find((f) => f.id === factorId);
    if (!factor) {
      clear();
      return failure(403);
    }
    if (action === "cancel") {
      clear();
      if (factor.status !== "unverified") return failure(403);
      const { data, error } = await client.auth.mfa.unenroll({
        factorId: factor.id,
      });
      if (error || !data || data.id !== factor.id) return failure(503);
      return go("/auth/mfa");
    }
    if (action === "challenge") {
      clear();
      const { data, error } = await client.auth.mfa.challenge({
        factorId: factor.id,
      });
      if (
        error ||
        !data ||
        data.type !== "totp" ||
        !factorIdValid(data.id) ||
        !Number.isFinite(data.expires_at) ||
        data.expires_at <= Date.now() / 1000
      )
        return go("/auth/mfa?notice=failed");
      const expires = Math.min(
        Math.floor(data.expires_at),
        Math.floor(Date.now() / 1000) + 300,
      );
      const value = makeMfaProof(
        {
          sub: context.sub,
          session_id: context.session_id,
          profile_id: context.profile_id,
          organization_id: context.organization_id,
          factor_id: factor.id,
          challenge_id: data.id,
        },
        config.secret,
        expires,
      );
      jar.set(mfaCookie, value, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.origin.startsWith("https:"),
        path: "/auth/mfa",
        maxAge: Math.max(1, expires - Math.floor(Date.now() / 1000)),
      });
      return html(challengeHtml(factor.id, data.id));
    }
    // El proveedor consume el challenge. La prueba local no se reutiliza en la UI.
    clear();
    const { error } = await client.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challengeId!,
      code: code!,
    });
    if (error)
      return go(
        "/auth/mfa?notice=" +
          (error.code === "mfa_challenge_expired" ? "expired" : "failed"),
      );
    // El mismo cliente writable contiene la sesión nueva guardada por el SDK.
    const user = await client.auth.getUser();
    const claims = await client.auth.getClaims();
    if (
      user.error ||
      claims.error ||
      !user.data.user ||
      user.data.user.id !== context.sub ||
      user.data.user.is_anonymous ||
      !user.data.user.email_confirmed_at ||
      claims.data?.claims.sub !== context.sub ||
      claims.data.claims.aal !== "aal2" ||
      typeof claims.data.claims.session_id !== "string" ||
      !claims.data.claims.session_id
    )
      return go("/auth/mfa?notice=failed");
    const fresh = await mfaContext(client, context.organization_id);
    if (
      fresh.status !== "ready" ||
      fresh.sub !== context.sub ||
      fresh.profile_id !== context.profile_id ||
      fresh.aal !== "aal2"
    )
      return go("/auth/mfa?notice=failed");
    return go("/seleccionar-organizacion");
  } catch (error) {
    diagnostic.fail("unexpected_exception", error);
    return failure(503);
  }
}

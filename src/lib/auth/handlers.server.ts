import { mfaCookie } from "./mfa-proof.server";
import {
  authFeatures,
  credentialPurposeEnabled,
  credentialUpdatesEnabled,
} from "./features.server";
import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authConfig, authOrigin, noStoreHeaders } from "@/lib/supabase/config";
import { readFields, safeNext, sameOriginPost } from "./security";
import {
  readRecoveryProof,
  makeRecoveryProof,
  validRecoveryProof,
  recoveryCookie,
} from "./recovery.server";
type Action = "login" | "logout" | "recover" | "password" | "confirm";
const failure = () =>
  NextResponse.json(
    { error: "No se pudo completar la solicitud." },
    { status: 400, headers: noStoreHeaders },
  );
const featureUnavailable = () =>
  NextResponse.json(
    { error: "Función de acceso no disponible." },
    { status: 503, headers: noStoreHeaders },
  );
export async function authPost(request: Request, action: Action) {
  const config = authConfig();
  if (!config)
    return NextResponse.json(
      { error: "Acceso no configurado." },
      { status: 503, headers: noStoreHeaders },
    );
  if (!sameOriginPost(request, config.origin))
    return NextResponse.json(
      { error: "Origen no permitido." },
      { status: 403, headers: noStoreHeaders },
    );
  const features = authFeatures();
  if (
    (action === "recover" && !features.emailRecovery) ||
    (action === "confirm" && !credentialUpdatesEnabled(features)) ||
    (action === "password" && !credentialUpdatesEnabled(features))
  )
    return featureUnavailable();
  const go = (path: string) =>
    NextResponse.redirect(new URL(path, config.origin), {
      status: 303,
      headers: noStoreHeaders,
    });
  try {
    const fields = await readFields(request);
    if (action === "confirm") {
      const purpose = fields.get("type");
      if (purpose !== "recovery" && purpose !== "invite")
        return go("/login?notice=callback_failed");
      if (!credentialPurposeEnabled(purpose, features))
        return featureUnavailable();
    }
    const jar = await cookies();
    if (action === "password") {
      const proof = readRecoveryProof(
        jar.get(recoveryCookie)?.value,
        config.secret,
      );
      if (!proof) return go("/login?notice=callback_failed");
      if (!credentialPurposeEnabled(proof.purpose, features))
        return featureUnavailable();
    }
    const client = await createServerSupabaseClient(true);
    const clearProof = () =>
      jar.set(recoveryCookie, "", {
        httpOnly: true,
        secure: config.origin.startsWith("https:"),
        sameSite: "lax",
        path: "/auth",
        maxAge: 0,
      });
    const clearMfa = () =>
      jar.set(mfaCookie, "", {
        httpOnly: true,
        secure: config.origin.startsWith("https:"),
        sameSite: "lax",
        path: "/auth/mfa",
        maxAge: 0,
      });
    const clearAuthCookies = () => {
      for (const item of jar.getAll())
        if (item.name.startsWith("sb-rnxgrunnrdlgjsbsrjev-auth-token"))
          jar.set(item.name, "", {
            path: "/",
            sameSite: "lax",
            secure: config.origin.startsWith("https:"),
            maxAge: 0,
          });
    };
    if (action === "logout") {
      clearMfa();
      try {
        await client.auth.signOut({ scope: "local" });
      } catch {
        /* Se limpia también la sesión local si Auth no responde. */
      }
      clearAuthCookies();
      clearProof();
      return go("/login?notice=logged_out");
    }
    if (action === "login" || action === "recover") {
      if (action === "login") clearMfa();
      const email = (fields.get("email") ?? "").trim(),
        password = fields.get("password") ?? "";
      if (email.length > 254 || !/^\S+@\S+\.\S+$/.test(email))
        return go("/login?notice=invalid");
      clearProof();
      if (action === "recover") {
        // La plantilla debe dirigir a /auth/confirm?token_hash={{ .TokenHash }}&type=recovery.
        await client.auth.resetPasswordForEmail(email, {
          redirectTo: config.origin + "/auth/callback",
        });
        return go("/auth/recuperar?notice=sent"); // Respuesta uniforme incluso si la cuenta no existe.
      }
      if (!password || password.length > 512)
        return go("/login?notice=credentials");
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) return go("/login?notice=credentials");
      return go(safeNext(fields.get("next")));
    }
    if (action === "confirm") {
      const type = fields.get("type"),
        token_hash = fields.get("token_hash") ?? "";
      if (
        (type !== "recovery" && type !== "invite") ||
        !/^[a-zA-Z0-9_-]{20,200}$/.test(token_hash)
      )
        return go("/login?notice=callback_failed");
      clearProof();
      const { error } = await client.auth.verifyOtp({ type, token_hash });
      if (error) return go("/login?notice=callback_failed");
      const { data: user, error: userError } = await client.auth.getUser();
      const { data, error: claimsError } = await client.auth.getClaims();
      if (
        userError ||
        claimsError ||
        !user.user ||
        data?.claims.sub !== user.user.id ||
        typeof data.claims.session_id !== "string"
      )
        return go("/login?notice=callback_failed");
      jar.set(
        recoveryCookie,
        makeRecoveryProof(
          {
            sub: user.user.id,
            session_id: data.claims.session_id,
            purpose: type,
          },
          config.secret,
        ),
        {
          httpOnly: true,
          secure: config.origin.startsWith("https:"),
          sameSite: "lax",
          path: "/auth",
          maxAge: 600,
        },
      );
      return go("/auth/actualizar-password");
    }
    if (action === "password") {
      const password = fields.get("password") ?? "";
      if (
        password.length < 12 ||
        password.length > 128 ||
        password !== fields.get("confirmation")
      )
        return go("/auth/actualizar-password?notice=password_invalid");
      const { data: user, error: userError } = await client.auth.getUser(),
        { data, error: claimsError } = await client.auth.getClaims();
      const sessionId = data?.claims.session_id;
      if (
        userError ||
        claimsError ||
        !user.user ||
        data?.claims.sub !== user.user.id ||
        typeof sessionId !== "string" ||
        !validRecoveryProof(
          jar.get(recoveryCookie)?.value,
          { sub: user.user.id, session_id: sessionId },
          config.secret,
        )
      )
        return go("/login?notice=callback_failed");
      const { error } = await client.auth.updateUser({ password });
      if (error) return go("/auth/actualizar-password?notice=password_invalid");
      clearProof();
      try {
        await client.auth.signOut({ scope: "local" });
      } catch {
        /* El cambio ya fue confirmado; se borran cookies locales. */
      }
      clearAuthCookies();
      return go("/login?notice=password_updated");
    }
    return failure();
  } catch {
    return action === "recover" ? go("/auth/recuperar?notice=sent") : failure();
  }
}
export async function authCallback(request: Request) {
  const config = authConfig();
  if (!config)
    return NextResponse.redirect(
      new URL(
        "/login?notice=unconfigured",
        authOrigin() ?? "http://127.0.0.1:3000",
      ),
      { status: 303, headers: noStoreHeaders },
    );
  // En 5A el callback PKCE pertenece a recuperación por correo, no al login con contraseña.
  if (!authFeatures().emailRecovery) return featureUnavailable();
  const dest = new URL("/login?notice=callback_failed", config.origin);
  try {
    const code = new URL(request.url).searchParams.get("code");
    if (code && code.length <= 2048) {
      const client = await createServerSupabaseClient(true);
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) {
        dest.pathname = "/seleccionar-organizacion";
        dest.search = "";
      }
    }
  } catch {
    /* No se reflejan errores ni códigos en la URL resultante. */
  }
  return NextResponse.redirect(dest, { status: 303, headers: noStoreHeaders });
}

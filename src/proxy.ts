import { readRecoveryProof, recoveryCookie } from "@/lib/auth/recovery.server";
import {
  authFeatures,
  shouldRefreshAuthPath,
  credentialPurposeEnabled,
} from "@/lib/auth/features.server";
import { randomBytes } from "node:crypto";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig, noStoreHeaders } from "@/lib/supabase/config";
import { authCsp } from "@/lib/auth/csp";
export async function proxy(request: NextRequest) {
  // Además del matcher, la demo queda fuera incluso ante una invocación directa.
  if (
    request.nextUrl.pathname === "/demo" ||
    request.nextUrl.pathname.startsWith("/demo/")
  )
    return NextResponse.next();
  const config = authConfig(),
    nonce = randomBytes(18).toString("base64");
  const csp = authCsp(
    nonce,
    process.env.NODE_ENV === "development",
    config?.url,
  );
  const forwarded = new Headers(request.headers);
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", csp);
  const freshResponse = () =>
    NextResponse.next({ request: { headers: forwarded } });
  let response = freshResponse();
  const writes = new Map<string, { value: string; options: CookieOptions }>();
  const cacheHeaders: Record<string, string> = {};
  const features = authFeatures(),
    path = request.nextUrl.pathname.replace(/\/+$/, "");
  let refresh = shouldRefreshAuthPath(path, features);
  // Estos handlers escriben cookies por sí mismos, después de comprobar el control.
  if (
    [
      "/auth/recover",
      "/auth/verify",
      "/auth/password",
      "/auth/mfa/enroll",
      "/auth/mfa/challenge",
      "/auth/mfa/verify",
      "/auth/mfa/cancel",
    ].includes(path) ||
    /^\/o\/[a-z0-9-]+\/acciones$/.test(path)
  )
    refresh = false;
  if (path === "/auth/confirm") {
    const purpose = request.nextUrl.searchParams.get("type");
    refresh =
      refresh &&
      (purpose === "invite" || purpose === "recovery") &&
      credentialPurposeEnabled(purpose, features);
  }
  if (path === "/auth/actualizar-password") {
    const proof = config
      ? readRecoveryProof(
          request.cookies.get(recoveryCookie)?.value,
          config.secret,
        )
      : null;
    refresh =
      refresh && !!proof && credentialPurposeEnabled(proof.purpose, features);
  }
  if (config && refresh) {
    const client = createServerClient(config.url, config.key, {
      cookieOptions: {
        path: "/",
        sameSite: "lax",
        secure: config.origin.startsWith("https:"),
      },
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (values, headers) => {
          values.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            writes.set(name, { value, options });
          });
          forwarded.set("cookie", request.cookies.toString());
          Object.assign(cacheHeaders, headers);
          response = freshResponse();
          writes.forEach(({ value, options }, name) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(cacheHeaders).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    });
    try {
      await client.auth.getClaims();
    } catch {
      /* El guard vuelve a verificar identidad y deniega ante error. */
    }
  }
  response.headers.set("Content-Security-Policy", csp);
  Object.entries(noStoreHeaders).forEach(([name, value]) =>
    response.headers.set(name, value),
  );
  return response;
}
export const config = {
  matcher: ["/login", "/auth/:path*", "/seleccionar-organizacion", "/o/:path*"],
};

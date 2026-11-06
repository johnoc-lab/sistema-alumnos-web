import assert from "node:assert/strict";
const base = process.env.CHECK_BASE_URL || "http://127.0.0.1:3000",
  origin = new URL(base);
assert(["127.0.0.1", "localhost"].includes(origin.hostname), "Solo loopback");
let requests = 0;
async function local(path, options) {
  requests++;
  return fetch(new URL(path, base), { redirect: "manual", ...options });
}
const login = await local("/login");
assert.equal(login.status, 200);
const html = await login.text();
assert(
  html.includes("Ingreso no habilitado"),
  "Ejecutar únicamente con Auth sin configurar.",
);
const csp = login.headers.get("content-security-policy") ?? "",
  nonce = /nonce-([^']+)/.exec(csp)?.[1];
assert(nonce && html.includes('nonce="' + nonce + '"'), "Nonce SSR ausente");
assert(!csp.split(";")[1]?.includes("unsafe-inline"));
for (const path of [
  "/auth/recuperar",
  "/auth/confirm",
  "/auth/actualizar-password",
  "/auth/mfa",
  "/o/impulso/admin",
  "/seleccionar-organizacion",
]) {
  const r = await local(path);
  assert.equal(r.status, 200, path);
  assert.match(r.headers.get("content-security-policy") ?? "", /nonce-/);
  assert.match(r.headers.get("cache-control") ?? "", /no-store/);
}
for (const path of [
  "login",
  "logout",
  "recover",
  "password",
  "verify",
  "mfa/enroll",
  "mfa/challenge",
  "mfa/verify",
  "mfa/cancel",
]) {
  const r = await local("/auth/" + path, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: origin.origin,
    },
    body: "intent=probe",
  });
  assert.equal(r.status, 503);
}
const callback = await local(
  "/auth/callback?code=fake-never-exchanged&next=https://evil.test",
);
assert.equal(callback.status, 303);
assert(!callback.headers.get("location")?.includes("evil.test"));
assert.equal((await local("/auth/logout")).status, 405);
for (const action of ["enroll", "challenge", "verify", "cancel"])
  assert.equal((await local("/auth/mfa/" + action)).status, 405);
const demo = await local("/demo");
assert(!(demo.headers.get("content-security-policy") ?? "").includes("nonce-"));
assert(!demo.headers.get("set-cookie"));
console.log(
  requests +
    " solicitudes HTTP Auth aprobadas sin credenciales: nonce SSR, caché, métodos, configuración cerrada y demo independiente.",
);

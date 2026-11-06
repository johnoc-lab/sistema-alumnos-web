import assert from "node:assert/strict";
const base = new URL(process.env.CHECK_BASE_URL || "http://127.0.0.1:3000");
assert(["127.0.0.1", "localhost"].includes(base.hostname), "Solo loopback");
let count = 0;
async function request(path, options = {}) {
  count++;
  return fetch(new URL(path, base), { redirect: "manual", ...options });
}
const login = await request("/login");
assert(
  (await login.text()).includes("Ingreso no habilitado"),
  "Solo servidor aislado con Auth deshabilitado",
);
const root = await request("/");
assert.equal(root.status, 307);
assert.equal(new URL(root.headers.get("location"), base).pathname, "/login");
for (const path of [
  "admin/cursos",
  "admin/alumnos",
  "admin/matriculas",
  "admin/materiales",
  "admin/avisos",
  "admin/calendario",
  "dashboard",
  "dashboard/cursos",
  "dashboard/materiales",
  "dashboard/avisos",
]) {
  const response = await request("/o/qa-sistema-alumnos-01/" + path);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert((await response.text()).includes('data-access-state="unconfigured"'));
}
const blocked = await request("/o/qa-sistema-alumnos-01/acciones", {
  method: "POST",
  headers: {
    origin: base.origin,
    "content-type": "application/x-www-form-urlencoded",
  },
  body: "action=course&title=NO_ESCRIBIR",
});
assert.equal(blocked.status, 503);
assert.equal((await request("/o/qa-sistema-alumnos-01/acciones")).status, 405);
assert.equal(
  (
    await request(
      "/o/qa-sistema-alumnos-01/archivos/11111111-1111-4111-8111-111111111111",
    )
  ).status,
  503,
);
console.log(
  count +
    " comprobaciones HTTP académicas aprobadas; Auth apagado, sin credenciales ni operaciones Cloud.",
);

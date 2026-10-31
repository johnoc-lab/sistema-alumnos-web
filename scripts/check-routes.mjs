import assert from "node:assert/strict";
const base = process.env.CHECK_BASE_URL || "http://127.0.0.1:3000";
const origin = new URL(base);
assert(
  ["127.0.0.1", "localhost"].includes(origin.hostname),
  "Solo se comprueban servidores locales.",
);
const sections = [
  "dashboard",
  "dashboard/cursos",
  "dashboard/calendario",
  "dashboard/perfil",
  "admin",
  "admin/alumnos",
  "admin/cursos",
  "admin/clases",
  "admin/avisos",
  "admin/materiales",
  "admin/calendario",
  "admin/certificados",
];
let checked = 0;
async function page(path, status = 200) {
  const response = await fetch(new URL(path, origin), { redirect: "manual" });
  assert.equal(
    response.status,
    status,
    path + " devuelve un estado inesperado",
  );
  if (status !== 200) {
    checked++;
    return "";
  }
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", path);
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /frame-ancestors 'none'/,
  );
  const body = await response.text();
  assert(!body.includes("Internal Server Error"), path);
  checked++;
  return body;
}
assert.match(await page("/login"), /Ingreso no habilitado/);
assert.match(
  await page("/seleccionar-organizacion"),
  /data-access-state="unconfigured"/,
);
assert.match(await page("/demo"), /data-preview="synthetic"/);
for (const slug of ["impulso", "incubadora"]) {
  for (const section of sections) {
    const real = await page(
      "/o/" + slug + "/" + section + "?demo=true&role=admin",
    );
    assert.match(real, /data-access-state="unconfigured"/);
    assert(
      !real.includes('data-preview="synthetic"'),
      "Una ruta real no puede renderizar fixtures.",
    );
    assert(
      !real.includes("lucia@example.test") &&
        !real.includes("valentina@example.test"),
      "Filtración de fixtures en acceso real.",
    );
    const demo = await page("/demo/o/" + slug + "/" + section);
    assert.match(demo, /data-preview="synthetic"/);
    assert.match(demo, /DEMOSTRACIÓN/);
    if (slug === "incubadora")
      assert(!demo.includes("lucia@example.test"), "Mezcla de organizaciones.");
  }
}
assert.match(
  await page("/demo/o/impulso/dashboard/cursos/estrategia-emprendedora"),
  /Reproducción no habilitada/,
);
await page("/demo/o/desconocida/admin", 404);
await page("/demo/o/impulso/admin/eliminar", 404);
await page("/demo/o/impulso/dashboard/cursos/marca-personal", 404);
console.log(
  "Comprobadas " +
    checked +
    " rutas locales: demo, acceso cerrado, cabeceras y 404.",
);

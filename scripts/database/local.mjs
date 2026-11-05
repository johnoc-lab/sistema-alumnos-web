import { spawnSync } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../../tests/database/engine.mjs";
const action = process.argv[2];
const docker = spawnSync(
  "docker",
  ["version", "--format", "{{.Server.Version}}"],
  { encoding: "utf8", windowsHide: true, timeout: 10000 },
);
const cli = path.join(projectRoot, "node_modules/supabase/dist/supabase.js");
const version = spawnSync(process.execPath, [cli, "--version"], {
  cwd: projectRoot,
  encoding: "utf8",
  windowsHide: true,
  timeout: 10000,
});
if (action === "doctor") {
  console.log(
    "Supabase CLI: " +
      (version.status === 0 ? version.stdout.trim() : "no disponible"),
  );
  console.log(
    "Docker con servidor operativo: " + (docker.status === 0 ? "sí" : "no"),
  );
  if (version.status !== 0 || docker.status !== 0) process.exitCode = 1;
} else if (["start", "reset", "pgtap"].includes(action)) {
  if (version.status !== 0 || docker.status !== 0)
    throw new Error(
      "Se requiere Supabase CLI y Docker operativo. No se inició ni reinició ningún servicio.",
    );
  let linked = false;
  try {
    await access(path.join(projectRoot, "supabase/.temp/project-ref"));
    linked = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (linked)
    throw new Error(
      "Se rechaza un proyecto vinculado; use una copia exclusivamente local.",
    );
  const args =
    action === "start"
      ? ["start"]
      : action === "reset"
        ? ["db", "reset"]
        : ["test", "db"];
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
} else throw new Error("Acción permitida: doctor, start, reset o pgtap.");

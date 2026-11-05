import pg from "pg";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../../tests/database/engine.mjs";
export async function connectLocal(applicationName = "phase4-security") {
  const raw = process.env.LOCAL_DB_URL;
  if (!raw)
    throw new Error(
      "Defina LOCAL_DB_URL solo para la pila Supabase local de pruebas.",
    );
  const url = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.port !== "54322" ||
    url.pathname !== "/postgres" ||
    url.search
  )
    throw new Error(
      "Solo se permite PostgreSQL de pruebas en loopback:54322/postgres sin parámetros URL.",
    );
  try {
    await readFile(path.join(projectRoot, "supabase/.temp/project-ref"));
    throw new Error("Proyecto vinculado: use una copia local sin project-ref.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const client = new pg.Client({
    connectionString: raw,
    application_name: applicationName,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT marker FROM private.local_test_environment WHERE marker=$1",
      ["sistema-alumnos-web-phase4-local-fixtures"],
    );
    if (result.rowCount !== 1)
      throw new Error("Falta el marcador del seed sintético local.");
    await client.query("SET statement_timeout='10s';SET lock_timeout='5s'");
    return client;
  } catch {
    await client.end();
    throw new Error(
      "Base rechazada: no se pudo verificar el entorno local sintético.",
    );
  }
}

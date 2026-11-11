import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
export async function migrate(db, before) {
  const migrations = (
    await readdir(path.join(projectRoot, "supabase/migrations"))
  )
    .filter((f) => f.endsWith(".sql") && (!before || f < before))
    .sort();
  for (const name of migrations) {
    try {
      await db.exec(
        await readFile(
          path.join(projectRoot, "supabase/migrations", name),
          "utf8",
        ),
      );
    } catch (error) {
      throw new Error(name + ": " + error.message, { cause: error });
    }
  }
  return migrations;
}
export async function createEmbedded() {
  const { PGlite } = await import("@electric-sql/pglite");
  const { btree_gist } = await import(
    "@electric-sql/pglite/contrib/btree_gist"
  );
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(
    await readFile(
      path.join(projectRoot, "tests/database/support/embedded-bootstrap.sql"),
      "utf8",
    ),
  );
  return db;
}

export async function migrateAndSeed(db) {
  const migrations = await migrate(db);
  await db.exec(
    await readFile(path.join(projectRoot, "supabase/seed.sql"), "utf8"),
  );
  return migrations;
}

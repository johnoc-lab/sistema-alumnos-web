import {
  createEmbedded,
  migrateAndSeed,
} from "../../tests/database/engine.mjs";
import { securitySuite } from "../../tests/database/security-suite.mjs";
const db = await createEmbedded();
try {
  const migrations = await migrateAndSeed(db);
  const results = await securitySuite(db);
  for (const r of results)
    if (!r.passed) console.error("FAIL: " + r.name + "\n  " + r.error);
  console.log(
    "PostgreSQL embebido: " +
      results.filter((r) => r.passed).length +
      "/" +
      results.length +
      " pruebas aprobadas; " +
      migrations.length +
      " migraciones + seed reconstruidos.",
  );
  console.log(
    "No prueba Auth HTTP, servicios Storage reales ni transacciones simultáneas en conexiones independientes.",
  );
  if (results.some((r) => !r.passed)) process.exitCode = 1;
} finally {
  await db.close();
}

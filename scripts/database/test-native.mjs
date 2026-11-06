import { connectLocal } from "./native-client.mjs";
import { securitySuite } from "../../tests/database/security-suite.mjs";
import { concurrencySuite } from "../../tests/database/concurrency-suite.mjs";
let db;
try {
  db = await connectLocal();
  const adapter = {
    query: (...args) => db.query(...args),
    exec: (sql) => db.query(sql),
  };
  const baseline = await securitySuite(adapter);
  const results = baseline.every((r) => r.passed)
    ? [...baseline, ...(await concurrencySuite(db))]
    : baseline;
  for (const result of results)
    console.log(
      (result.passed ? "PASS " : "FAIL ") +
        result.name +
        (result.error ? ": " + result.error : ""),
    );
  const count = results.filter((r) => r.passed).length;
  console.log(
    count +
      "/" +
      results.length +
      " pruebas PostgreSQL nativo; no cubren Auth HTTP ni bytes de Storage.",
  );
  if (count !== results.length) process.exitCode = 1;
} catch (error) {
  console.error("Pruebas nativas no completadas: " + error.message);
  process.exitCode = 1;
} finally {
  if (db) await db.end();
}

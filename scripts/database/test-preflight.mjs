import { migrationBoundarySuite } from "../../tests/database/migration-boundaries.mjs";
try {
  const count = await migrationBoundarySuite();
  console.log(
    count +
      "/" +
      count +
      " comprobaciones embebidas sin seed. No se contactó Supabase Cloud.",
  );
} catch (error) {
  console.error("FAIL comprobación sin seed: " + error.message);
  process.exitCode = 1;
}

import { qaProvisionSuite } from "../../tests/database/qa-provision-suite.mjs";

if (process.argv.length !== 2) {
  console.error(
    "El runner solo acepta PostgreSQL embebido en memoria; no admite destinos ni argumentos.",
  );
  process.exitCode = 1;
} else {
  try {
    const { results, engineVersion } = await qaProvisionSuite();
    for (const result of results) {
      console.log(
        (result.passed ? "PASS: " : "FAIL: ") +
          result.name +
          (result.passed ? "" : " [" + result.code + "]"),
      );
    }
    const passed = results.filter((result) => result.passed).length;
    console.log(
      passed +
        "/" +
        results.length +
        " comprobaciones; PostgreSQL embebido " +
        engineVersion +
        ".",
    );
    console.log(
      "Sin seed, red o cuentas Auth reales. RLS usa claims locales simulados; no acredita MFA ni sesiones Cloud.",
    );
    if (passed !== results.length) process.exitCode = 1;
  } catch (error) {
    console.error(
      "FAIL: preparación PostgreSQL desechable [" +
        (typeof error.code === "string" ? error.code : "SETUP_FAILED") +
        "]",
    );
    process.exitCode = 1;
  }
}

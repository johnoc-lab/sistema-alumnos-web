import { qaCloudAdapterSuite } from "../../tests/database/qa-cloud-adapter-suite.mjs";
if (process.argv.length !== 2) {
  console.error(
    "Solo validación embebida; no se admiten argumentos, URL o destinos.",
  );
  process.exitCode = 1;
} else {
  try {
    const { results, engineVersion } = await qaCloudAdapterSuite();
    for (const result of results)
      console.log(
        (result.passed ? "PASS: " : "FAIL: ") +
          result.name +
          (result.passed ? "" : " [" + result.code + "]"),
      );
    const passed = results.filter((x) => x.passed).length;
    console.log(
      passed +
        "/" +
        results.length +
        " comprobaciones; PostgreSQL embebido " +
        engineVersion +
        ".",
    );
    console.log(
      "Original Cloud protegido para PG17.11. Copia de ensayo instrumentada solo en memoria: versión y dos UUID sintéticos. Sin seed, Cloud o cuentas Auth reales.",
    );
    console.log(
      "No acredita ejecución nativa PG17, titularidad de buzones, aprobación remota ni sesiones/MFA reales.",
    );
    if (passed !== results.length) process.exitCode = 1;
  } catch (error) {
    console.error(
      "FAIL preparación local [" +
        (typeof error.code === "string" ? error.code : "SETUP_FAILED") +
        "]",
    );
    process.exitCode = 1;
  }
}

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const command = process.argv[2];
if (!["dev", "build", "start"].includes(command))
  throw new Error("Comando Next no permitido.");
const args = [require.resolve("next/dist/bin/next"), command];
if (command !== "build") args.push("--hostname", "127.0.0.1");
const child = spawn(process.execPath, args, {
  stdio: "inherit",
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
});
child.on("exit", (code) => process.exit(code ?? 1));

import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { developmentEnvironment } from "./environment.mjs";

export function launchDevelopment(root, args, env = process.env) {
  if (!["dev", "preview"].includes(args[0])) {
    process.stderr.write(
      "Usage: launch.mjs dev|preview [electron-vite options]\n",
    );
    return 2;
  }
  try {
    const source = realpathSync(root);
    const developmentEnv = developmentEnvironment(source, env);
    process.stdout.write(
      `[d-pi ${args[0].toUpperCase()}] source: ${source}\nApp data: ${developmentEnv.D_PI_DATA_DIR}\n`,
    );
    const result = spawnSync(
      process.execPath,
      [
        resolve(source, "node_modules/electron-vite/bin/electron-vite.js"),
        ...args,
      ],
      { cwd: source, env: developmentEnv, stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.signal) return result.signal === "SIGINT" ? 130 : 1;
    return result.status ?? 2;
  } catch (error) {
    process.stderr.write(`FAIL: development startup: ${error.message}\n`);
    return 2;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  process.exitCode = launchDevelopment(
    resolve(import.meta.dirname, "../.."),
    process.argv.slice(2),
  );

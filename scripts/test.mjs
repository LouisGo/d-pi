import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createTestEnvironment } from "./test-environment.mjs";

const root = resolve(import.meta.dirname, "..");
const [suite, ...args] = process.argv.slice(2);
if (!["vitest", "node"].includes(suite))
  throw new Error(
    "Usage: node scripts/test.mjs vitest [arguments] | node [test files]",
  );
const sandbox = createTestEnvironment({
  toolPaths: [resolve(root, "node_modules/.bin")],
  // Native smoke stays an explicit opt-in. Credentials are never inherited.
  fixtureEnv:
    process.env.D_PI_NATIVE_SMOKE === "1" ? { D_PI_NATIVE_SMOKE: "1" } : {},
});
if (suite === "vitest")
  process.stdout.write(
    process.env.D_PI_NATIVE_SMOKE === "1"
      ? "RUN: fixed CLI artifact native behavior smoke (isolated localhost provider)\n"
      : "SKIP: fixed CLI artifact native behavior smoke; opt in with D_PI_NATIVE_SMOKE=1 after runtime:fetch\n",
  );
try {
  const arguments_ =
    suite === "vitest"
      ? [
          resolve(root, "node_modules/vitest/vitest.mjs"),
          "run",
          "--root",
          root,
          "--config",
          resolve(root, "vitest.config.ts"),
          ...args,
        ]
      : ["--test", ...args.map((path) => resolve(root, path))];
  const result = spawnSync(process.execPath, arguments_, {
    cwd: sandbox.cwd,
    env: sandbox.env,
    stdio: "inherit",
  });
  if (result.error || result.signal) {
    process.stderr.write(
      `FAIL: test runner ${result.signal ? `crashed (${result.signal})` : `could not start (${result.error.message})`}; tests did not complete.\n`,
    );
    process.exitCode = 2;
  } else process.exitCode = result.status ?? 2;
} finally {
  sandbox.cleanup();
}

import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestEnvironment } from "../scripts/testing/test-environment.mjs";

const sdk = fileURLToPath(new URL("../resources/sdk/", import.meta.url));
const fixture = createTestEnvironment({ prefix: "d-pi-subagent-" });
const suite = mkdtempSync(join(sdk, ".subagent-test-"));
try {
  for (const name of [
    "native-subagent-configuration.mjs",
    "native-subagent-configuration.test.mjs",
  ])
    cpSync(fileURLToPath(new URL(name, import.meta.url)), join(suite, name));
  execFileSync(
    join(sdk, "bun"),
    ["test", join(suite, "native-subagent-configuration.test.mjs")],
    {
      env: fixture.env,
      cwd: fixture.cwd,
      timeout: 45000,
      stdio: "inherit",
    },
  );
} finally {
  rmSync(suite, { recursive: true, force: true });
  fixture.cleanup();
}

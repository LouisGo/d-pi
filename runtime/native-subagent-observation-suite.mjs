import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestEnvironment } from "../scripts/testing/test-environment.mjs";

const sdk = fileURLToPath(new URL("../resources/sdk/", import.meta.url));
const fixture = createTestEnvironment({
  prefix: "d-pi-subagent-observation-",
  fixtureEnv: {
    OBSERVATION_EVIDENCE_PATH: resolve(
      process.argv[2] ?? "dist/validation/05d-native-sdk-frames.json",
    ),
  },
});
const suite = mkdtempSync(join(sdk, ".subagent-observation-"));
try {
  cpSync(
    fileURLToPath(
      new URL("native-subagent-observation.test.mjs", import.meta.url),
    ),
    join(suite, "native-subagent-observation.test.mjs"),
  );
  execFileSync(
    join(sdk, "bun"),
    ["test", join(suite, "native-subagent-observation.test.mjs")],
    { env: fixture.env, cwd: fixture.cwd, timeout: 45000, stdio: "inherit" },
  );
} finally {
  rmSync(suite, { recursive: true, force: true });
  fixture.cleanup();
}

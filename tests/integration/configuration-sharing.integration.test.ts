import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("shares native login and cached models both ways while CLI is open and from a desktop-only home", () => {
  const result = spawnSync(
    process.execPath,
    ["validation/m2/configuration-sharing.mjs"],
    {
      env: { ...process.env, D_PI_CONFIGURATION_SOURCE: "1" },
      cwd: fileURLToPath(new URL("../..", import.meta.url)),
      encoding: "utf8",
      timeout: 60000,
    },
  );
  expect(result.status, result.stderr).toBe(0);
  const evidence = JSON.parse(result.stdout.trim());
  expect(evidence.realSupplierRequests).toBe(0);
  expect(evidence.checks).toContain(
    "actual official CLI RPC model list reuses desktop login without reconfiguration",
  );
}, 65000);

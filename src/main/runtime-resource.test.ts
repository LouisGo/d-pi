import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { managedRuntime } from "./runtime-resource";

it("distinguishes missing managed resources from a checksum mismatch without executing either", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-resource-"));
  try {
    await expect(managedRuntime(root)).rejects.toMatchObject({
      code: "resource-missing",
    });
    mkdirSync(join(root, "omp"));
    writeFileSync(join(root, "omp", "omp"), "invalid");
    await expect(managedRuntime(root)).rejects.toMatchObject({
      code: "resource-incompatible",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

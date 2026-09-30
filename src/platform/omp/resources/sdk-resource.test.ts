import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { managedSdkRuntime } from "./sdk-resource";

it("admits a complete current-platform SDK launcher and refuses tampering without executing it", async () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-sdk-resource-"));
  try {
    await expect(managedSdkRuntime(root)).rejects.toMatchObject({
      code: "resource-incompatible",
    });
    mkdirSync(join(root, "sdk"));
    const hashes: Record<string, string> = {};
    for (const name of ["bun", "host.mjs", "gate.js", "configuration.mjs"]) {
      writeFileSync(join(root, "sdk", name), name);
      hashes[name] = createHash("sha256").update(name).digest("hex");
    }
    chmodSync(join(root, "sdk/bun"), 0o755);
    writeFileSync(
      join(root, "sdk/manifest.json"),
      JSON.stringify({
        sdkVersion: "18.3.0",
        bunVersion: "1.3.14",
        platform: `${process.platform}-${process.arch}`,
        hashes,
      }),
    );
    await expect(managedSdkRuntime(root)).resolves.toEqual({
      binary: join(root, "sdk/bun"),
      entry: join(root, "sdk/host.mjs"),
    });
    writeFileSync(join(root, "sdk/gate.js"), "changed");
    await expect(managedSdkRuntime(root)).rejects.toMatchObject({
      code: "resource-incompatible",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

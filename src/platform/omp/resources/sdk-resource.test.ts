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
    for (const name of [
      "bun",
      "host.mjs",
      "gate.js",
      "configuration.mjs",
      "configuration-readonly.mjs",
      "model-selection.mjs",
    ]) {
      writeFileSync(join(root, "sdk", name), name);
      hashes[name] = createHash("sha256").update(name).digest("hex");
    }
    chmodSync(join(root, "sdk/bun"), 0o755);
    mkdirSync(join(root, "sdk/node_modules/@oh-my-pi/pi-coding-agent/src"), {
      recursive: true,
    });
    writeFileSync(
      join(root, "sdk/node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts"),
      "fixture-sdk-source",
    );
    writeFileSync(
      join(root, "sdk/manifest.json"),
      JSON.stringify({
        sdkVersion: "18.4.6",
        sdkImportFix: {
          file: "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
          originalSha256: "0".repeat(64),
          sha256: createHash("sha256")
            .update("fixture-sdk-source")
            .digest("hex"),
          originalImport:
            'import { createRatchetPrelude } from "./ratchet/prelude";',
          fixedImport:
            'import { createRatchetPrelude } from "./ratchet/prelude.ts";',
          authorized: "2026-10-01",
        },
        bunVersion: "1.3.14",
        platform: `${process.platform}-${process.arch}`,
        hashes,
      }),
    );
    for (const name of ["pi-coding-agent", "pi-utils"]) {
      const packageRoot = join(root, "sdk/node_modules/@oh-my-pi", name);
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(
        join(packageRoot, "package.json"),
        JSON.stringify({
          name: `@oh-my-pi/${name}`,
          version: "18.4.6",
          exports: {
            ".": { import: "./src/index.ts" },
            "./*": { import: "./src/*.ts" },
          },
        }),
      );
      mkdirSync(join(packageRoot, "src"), { recursive: true });
      writeFileSync(join(packageRoot, "src/index.ts"), "export {};\n");
    }
    await expect(managedSdkRuntime(root)).resolves.toEqual({
      binary: join(root, "sdk/bun"),
      entry: join(root, "sdk/host.mjs"),
    });
    writeFileSync(
      join(root, "sdk/node_modules/@oh-my-pi/pi-utils/package.json"),
      JSON.stringify({
        name: "@oh-my-pi/pi-utils",
        version: "18.3.0",
        exports: { ".": { import: "./src/index.ts" } },
      }),
    );
    await expect(managedSdkRuntime(root)).rejects.toMatchObject({
      code: "resource-incompatible",
    });
    writeFileSync(
      join(root, "sdk/node_modules/@oh-my-pi/pi-utils/package.json"),
      JSON.stringify({
        name: "@oh-my-pi/pi-utils",
        version: "18.4.6",
        exports: { ".": { import: "./src/index.ts" } },
      }),
    );
    writeFileSync(join(root, "sdk/gate.js"), "changed");
    await expect(managedSdkRuntime(root)).rejects.toMatchObject({
      code: "resource-incompatible",
    });
    writeFileSync(join(root, "sdk/gate.js"), "gate.js");
    await expect(managedSdkRuntime(root)).resolves.toBeDefined();
    writeFileSync(
      join(root, "sdk/node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts"),
      "unexpected upstream edit",
    );
    await expect(managedSdkRuntime(root)).rejects.toMatchObject({
      code: "resource-incompatible",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
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
      "native-queue.mjs",
      "reading-session.mjs",
      "thread-history.mjs",
      "managed-session.mjs",
      "image-input.mjs",
      "image-compression.mjs",
      "native-subagent-configuration.mjs",
      "pdf-content.mjs",
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
      readFileSync(
        new URL(
          "../../../../node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
          import.meta.url,
        ),
      ),
    );
    writeFileSync(
      join(root, "sdk/manifest.json"),
      JSON.stringify({
        sdkVersion: "18.8.7",
        sdkSource: {
          file: "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts",
          sha256:
            "d693c1b71e70f61c38c2cf564c608750401179509e8c6c414d1e124baa96e69a",
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
          version: "18.8.7",
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
    await expect(
      managedSdkRuntime(root, "document-content.mjs"),
    ).rejects.toMatchObject({
      code: "resource-incompatible",
    });
    writeFileSync(
      join(root, "sdk/document-content.mjs"),
      "document-content.mjs",
    );
    hashes["document-content.mjs"] = createHash("sha256")
      .update("document-content.mjs")
      .digest("hex");
    const manifest = JSON.parse(
      readFileSync(join(root, "sdk/manifest.json"), "utf8"),
    );
    manifest.hashes = hashes;
    writeFileSync(join(root, "sdk/manifest.json"), JSON.stringify(manifest));
    await expect(
      managedSdkRuntime(root, "document-content.mjs"),
    ).resolves.toBeDefined();
    for (const name of [
      "native-queue.mjs",
      "reading-session.mjs",
      "thread-history.mjs",
      "managed-session.mjs",
      "image-input.mjs",
      "image-compression.mjs",
      "native-subagent-configuration.mjs",
      "pdf-content.mjs",
      "document-content.mjs",
    ]) {
      writeFileSync(join(root, "sdk", name), "unexpected adapter edit");
      await expect(managedSdkRuntime(root)).rejects.toMatchObject({
        code: "resource-incompatible",
      });
      writeFileSync(join(root, "sdk", name), name);
      await expect(managedSdkRuntime(root)).resolves.toBeDefined();
    }
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
        version: "18.8.7",
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

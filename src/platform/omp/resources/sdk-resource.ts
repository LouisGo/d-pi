import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, readFile, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { z } from "zod";
import { RuntimeResourceError } from "./runtime-resource";
import { holdSdkResources } from "./sdk-resource-guard";

const ManifestSchema = z.object({
  sdkVersion: z.literal("18.8.7"),
  bunVersion: z.literal("1.3.14"),
  sdkImportFix: z.never().optional(),
  sdkSource: z.object({
    file: z.literal("node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts"),
    sha256: z.literal(
      "d693c1b71e70f61c38c2cf564c608750401179509e8c6c414d1e124baa96e69a",
    ),
  }),
  platform: z.string(),
  hashes: z.object({
    bun: z.string(),
    "host.mjs": z.string(),
    "gate.js": z.string(),
    "configuration.mjs": z.string(),
    "configuration-readonly.mjs": z.string(),
    "model-selection.mjs": z.string(),
    "native-queue.mjs": z.string(),
    "thread-history.mjs": z.string().min(1),
    "reading-session.mjs": z.string(),
    "managed-session.mjs": z.string(),
    "image-input.mjs": z.string(),
    "image-compression.mjs": z.string(),
    "native-subagent-configuration.mjs": z.string(),
    "pdf-content.mjs": z.string(),
    "document-content.mjs": z.string().optional(),
  }),
});
export async function managedSdkRuntime(
  root: string,
  requiredAdapter?: "document-content.mjs",
): Promise<{ binary: string; entry: string }> {
  try {
    const directory = join(root, "sdk");
    // Retained for Main's lifetime, covering asynchronous validation and spawn.
    holdSdkResources(directory);
    const manifest = ManifestSchema.parse(
      JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
    );
    if (requiredAdapter && !manifest.hashes[requiredAdapter])
      throw Error("Required SDK adapter is not verified");
    if (manifest.platform !== `${process.platform}-${process.arch}`)
      throw Error("Platform mismatch");
    for (const [name, expected] of Object.entries({
      ...manifest.hashes,
      [manifest.sdkSource.file]: manifest.sdkSource.sha256,
    })) {
      const hash = createHash("sha256");
      for await (const bytes of createReadStream(join(directory, name)))
        hash.update(bytes);
      if (hash.digest("hex") !== expected) throw Error("SDK resource mismatch");
    }
    const resourceRoot = await realpath(directory);
    for (const name of ["pi-coding-agent", "pi-utils"] as const) {
      const packageRoot = await realpath(
        join(directory, "node_modules/@oh-my-pi", name),
      );
      const metadata = z
        .object({
          name: z.literal(`@oh-my-pi/${name}`),
          version: z.literal("18.8.7"),
          exports: z.object({
            ".": z.object({ import: z.literal("./src/index.ts") }),
            ...(name === "pi-coding-agent"
              ? { "./*": z.object({ import: z.literal("./src/*.ts") }) }
              : {}),
          }),
        })
        .parse(
          JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")),
        );
      if (
        metadata.version !== manifest.sdkVersion ||
        !packageRoot.startsWith(`${resourceRoot}${sep}`)
      )
        throw Error("SDK package identity mismatch");
      const entry = await realpath(
        join(
          packageRoot,
          name === "pi-coding-agent" ? "src/sdk.ts" : "src/index.ts",
        ),
      );
      if (!entry.startsWith(`${packageRoot}${sep}`))
        throw Error("SDK entry outside managed resources");
    }
    const binary = join(directory, "bun");
    await access(binary, constants.X_OK);
    return { binary, entry: join(directory, "host.mjs") };
  } catch {
    throw new RuntimeResourceError(
      "resource-incompatible",
      "官方 SDK 运行资源缺失或校验失败。开发环境请运行 pnpm runtime:sdk；随包版本请重新获取完整应用。",
    );
  }
}

export async function managedConfigurationRuntime(
  root: string,
): Promise<{ binary: string; entry: string }> {
  const runtime = await managedSdkRuntime(root);
  const directory = join(root, "sdk");
  return {
    binary: runtime.binary,
    entry: join(directory, "configuration.mjs"),
  };
}

export async function managedThreadHistoryRuntime(
  root: string,
): Promise<{ binary: string; entry: string }> {
  const runtime = await managedSdkRuntime(root);
  const manifest = ManifestSchema.parse(
    JSON.parse(await readFile(join(root, "sdk", "manifest.json"), "utf8")),
  );
  if (!manifest.hashes["thread-history.mjs"])
    throw new RuntimeResourceError(
      "resource-incompatible",
      "Native thread history adapter unavailable",
    );
  return {
    binary: runtime.binary,
    entry: join(root, "sdk", "thread-history.mjs"),
  };
}

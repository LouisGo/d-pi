import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { RuntimeResourceError } from "./runtime-resource";

const ManifestSchema = z.object({
  sdkVersion: z.literal("18.3.0"),
  bunVersion: z.literal("1.3.14"),
  platform: z.string(),
  hashes: z.object({
    bun: z.string(),
    "host.mjs": z.string(),
    "gate.js": z.string(),
  }),
});
export async function managedSdkRuntime(
  root: string,
): Promise<{ binary: string; entry: string }> {
  try {
    const directory = join(root, "sdk");
    const manifest = ManifestSchema.parse(
      JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")),
    );
    if (manifest.platform !== `${process.platform}-${process.arch}`)
      throw Error("Platform mismatch");
    for (const [name, expected] of Object.entries(manifest.hashes)) {
      const hash = createHash("sha256");
      for await (const bytes of createReadStream(join(directory, name)))
        hash.update(bytes);
      if (hash.digest("hex") !== expected) throw Error("SDK resource mismatch");
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

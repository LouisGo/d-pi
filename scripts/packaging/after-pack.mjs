import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  APP_SIZE_LIMIT,
  auditSdkTree,
  measureTree,
} from "../runtime/sdk-packaging.mjs";

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder"));
const libraryRequire = createRequire(builderRequire.resolve("app-builder-lib"));
const { listPackage } = libraryRequire("@electron/asar");

/** Called after resource copying, before signing or any distributable creation. */
export async function auditPackagedApp(appPath, target) {
  const resources = join(appPath, "Contents/Resources");
  const sdkPath = join(resources, "sdk");
  const manifest = JSON.parse(
    await readFile(join(sdkPath, "manifest.json"), "utf8"),
  );
  if (manifest.platform !== `${target.platform}-${target.arch}`)
    throw Error("Packaged SDK platform differs from Electron target");
  if (manifest.packaging?.policyVersion !== 1)
    throw Error("SDK packaging policy is stale; run pnpm runtime:sdk");
  if (
    manifest.sdkVersion !== "18.8.7" ||
    manifest.bunVersion !== "1.3.14" ||
    manifest.sdkImportFix !== undefined ||
    manifest.sdkSource?.file !==
      "node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts" ||
    manifest.sdkSource?.sha256 !==
      "d693c1b71e70f61c38c2cf564c608750401179509e8c6c414d1e124baa96e69a"
  )
    throw Error("Packaged official SDK source identity mismatch");
  for (const [name, expected] of Object.entries({
    ...manifest.hashes,
    [manifest.sdkSource.file]: manifest.sdkSource.sha256,
  })) {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(join(sdkPath, name)))
      hash.update(chunk);
    if (hash.digest("hex") !== expected)
      throw Error(`Packaged SDK hash mismatch: ${name}`);
  }
  const asarEntries = listPackage(join(resources, "app.asar"));
  if (asarEntries.some((entry) => /^\/node_modules(?:\/|$)/.test(entry)))
    throw Error(
      "Bundled application unexpectedly includes node_modules in ASAR",
    );
  for (const entry of [
    "/out/main/index.js",
    "/out/main/session-host.js",
    "/out/preload/index.cjs",
    "/out/renderer/index.html",
    "/THIRD_PARTY_NOTICES.md",
  ])
    if (!asarEntries.includes(entry))
      throw Error(`Packaged application is missing ${entry}`);
  const sdk = await auditSdkTree(sdkPath, target);
  const app = await measureTree(appPath);
  if (app.bytes > APP_SIZE_LIMIT)
    throw Error(`App exceeds ${APP_SIZE_LIMIT} byte budget: ${app.bytes}`);
  return {
    platform: manifest.platform,
    sdk,
    app,
    budgetBytes: APP_SIZE_LIMIT,
    asarFiles: asarEntries.length,
  };
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin")
    throw Error("Only macOS packaging is supported");
  const arch = ["ia32", "x64", "armv7l", "arm64", "universal"][context.arch];
  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const report = await auditPackagedApp(appPath, { platform: "darwin", arch });
  await writeFile(
    join(context.appOutDir, "package-size.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `Package size: ${(report.app.bytes / 1024 / 1024).toFixed(1)} MiB / ${APP_SIZE_LIMIT / 1024 / 1024} MiB budget; SDK ${(report.sdk.bytes / 1024 / 1024).toFixed(1)} MiB. Report: ${join(context.appOutDir, "package-size.json")}`,
  );
}

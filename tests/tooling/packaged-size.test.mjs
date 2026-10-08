import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { auditPackagedApp } from "../../scripts/packaging/after-pack.mjs";
import { APP_SIZE_LIMIT } from "../../scripts/runtime/sdk-packaging.mjs";

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("electron-builder"));
const libraryRequire = createRequire(builderRequire.resolve("app-builder-lib"));
const { createPackage } = libraryRequire("@electron/asar");
const target = { platform: "darwin", arch: "arm64" };

async function fixture(t, duplicate = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-packaged-size-")));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function write(path, body) {
    const file = join(root, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
    return file;
  }
  for (const name of [
    "out/main/index.js",
    "out/main/session-host.js",
    "out/preload/index.cjs",
    "out/renderer/index.html",
    "THIRD_PARTY_NOTICES.md",
  ])
    write(`asar/${name}`, "required application file");
  if (duplicate)
    write("asar/node_modules/duplicate/index.js", "duplicated dependency");
  const resources = "d-pi.app/Contents/Resources";
  const sdk = `${resources}/sdk`;
  const entry =
    "node_modules/.pnpm/agent/node_modules/@oh-my-pi/pi-coding-agent/src/sdk.ts";
  const hashes = {};
  for (const name of [
    "bun",
    "host.mjs",
    "gate.js",
    "configuration.mjs",
    "configuration-readonly.mjs",
    "model-selection.mjs",
    "native-queue.mjs",
    "reading-session.mjs",
    "image-input.mjs",
    "image-compression.mjs",
    "native-subagent-configuration.mjs",
    "pdf-content.mjs",
    entry,
  ]) {
    const body = `required resource ${name}`;
    write(`${sdk}/${name}`, body);
    hashes[name] = createHash("sha256").update(body).digest("hex");
  }
  write(
    `${sdk}/node_modules/.pnpm/agent/node_modules/@oh-my-pi/pi-coding-agent/package.json`,
    JSON.stringify({ name: "@oh-my-pi/pi-coding-agent", version: "18.4.6" }),
  );
  write(
    `${sdk}/manifest.json`,
    JSON.stringify({
      platform: "darwin-arm64",
      hashes,
      packaging: { policyVersion: 1 },
      sdkImportFix: { file: entry, sha256: hashes[entry] },
    }),
  );
  await createPackage(join(root, "asar"), join(root, resources, "app.asar"));
  return {
    root,
    write,
    app: join(root, "d-pi.app"),
    manifest: join(root, sdk, "manifest.json"),
  };
}

test("the package audit measures actual contents and rejects platform and launcher mismatches", async (t) => {
  const f = await fixture(t);
  const report = await auditPackagedApp(f.app, target);
  assert.ok(report.app.bytes > report.sdk.bytes);
  assert.equal(report.budgetBytes, APP_SIZE_LIMIT);
  await assert.rejects(
    auditPackagedApp(f.app, { ...target, arch: "x64" }),
    /differs from Electron target/,
  );
  f.write("d-pi.app/Contents/Resources/sdk/host.mjs", "tampered host");
  await assert.rejects(auditPackagedApp(f.app, target), /hash mismatch/);
});

test("the package audit rejects duplicated application dependencies and oversized apps", async (t) => {
  const duplicated = await fixture(t, true);
  await assert.rejects(
    auditPackagedApp(duplicated.app, target),
    /includes node_modules/,
  );
  const f = await fixture(t);
  const large = f.write(
    "d-pi.app/Contents/Resources/unexpected-large-file",
    "",
  );
  truncateSync(large, APP_SIZE_LIMIT + 1);
  await assert.rejects(auditPackagedApp(f.app, target), /App exceeds.*budget/);
  const manifest = JSON.parse(readFileSync(f.manifest, "utf8"));
  delete manifest.packaging;
  writeFileSync(f.manifest, JSON.stringify(manifest));
  await assert.rejects(auditPackagedApp(f.app, target), /policy is stale/);
});

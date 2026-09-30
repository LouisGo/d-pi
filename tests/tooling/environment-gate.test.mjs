import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  inspectEnvironment,
  inspectSdk,
  probeTool,
} from "../../scripts/check-environment.mjs";

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "d-pi-env-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), contents);
  }
  return root;
}

test("distinguishes missing, crashed, failed and successful tool processes", () => {
  assert.equal(probeTool("missing-d-pi-check-tool", []).kind, "missing");
  const killed = probeTool(process.execPath, [
    "-e",
    "process.kill(process.pid, 'SIGTRAP')",
  ]);
  assert.equal(killed.kind, "crashed");
  assert.equal(killed.reason, "SIGTRAP");
  const failed = probeTool(process.execPath, ["-e", "process.exit(3)"]);
  assert.equal(failed.kind, "failed");
  assert.equal(failed.status, 3);
  assert.equal(probeTool(process.execPath, ["--version"]).kind, "ran");
});

test("checks installed metadata even when package exports hide package.json and require entries", (t) => {
  const root = fixture(t, {
    "package.json": JSON.stringify({
      packageManager: "pnpm@10.5.2",
      dependencies: { "@fixture/hidden": "1.0.0" },
    }),
    ".node-version": process.versions.node,
    "node_modules/@fixture/hidden/package.json": JSON.stringify({
      name: "@fixture/hidden",
      version: "1.0.0",
      type: "module",
      exports: { ".": { import: "./index.mjs" } },
    }),
    "node_modules/@fixture/hidden/index.mjs": "export const value = true;\n",
    "bin/pnpm": "#!/bin/sh\nprintf '10.5.2\\n'\n",
  });
  chmodSync(join(root, "bin/pnpm"), 0o755);
  const inheritedPath = process.env.PATH;
  process.env.PATH = join(root, "bin");
  try {
    const report = inspectEnvironment(root, { toolsOnly: true });
    assert.equal(report.installed["@fixture/hidden"], "1.0.0");
    assert.doesNotMatch(report.issues.join("\n"), /metadata unavailable/);
  } finally {
    if (inheritedPath === undefined) delete process.env.PATH;
    else process.env.PATH = inheritedPath;
  }
});

test("SDK inspection refuses stale locks, tampered files and missing bundled resources", (t) => {
  const hash = (content) => createHash("sha256").update(content).digest("hex");
  const declared = {
    "@oh-my-pi/pi-coding-agent": "18.3.0",
    "@oh-my-pi/pi-utils": "18.3.0",
    bun: "1.3.14",
  };
  const root = fixture(t, {
    "pnpm-lock.yaml": "fixture-lock\n",
    "sdk/manifest.json": JSON.stringify({
      sdkVersion: "18.3.0",
      bunVersion: "1.3.14",
      platform: `${process.platform}-${process.arch}`,
      lockHash: hash("fixture-lock\n"),
      hashes: {
        bun: hash("fixture-bun"),
        "host.mjs": hash("fixture-host"),
        "gate.js": hash("fixture-gate"),
      },
    }),
    "sdk/bun": "fixture-bun",
    "sdk/host.mjs": "fixture-host",
    "sdk/gate.js": "fixture-gate",
    "sdk/BUN-LICENSE.md": "fixture-license",
    "sdk/node_modules/@oh-my-pi/pi-coding-agent/package.json": JSON.stringify({
      version: "18.3.0",
    }),
    "sdk/node_modules/@oh-my-pi/pi-utils/package.json": JSON.stringify({
      version: "18.3.0",
    }),
  });
  assert.deepEqual(inspectSdk(root, join(root, "sdk"), declared).issues, []);
  writeFileSync(join(root, "sdk/host.mjs"), "tampered");
  writeFileSync(join(root, "pnpm-lock.yaml"), "changed-lock");
  rmSync(join(root, "sdk/gate.js"));
  const report = inspectSdk(root, join(root, "sdk"), declared);
  assert.match(report.issues.join("\n"), /lockHash is stale/);
  assert.match(report.issues.join("\n"), /hash mismatch: host.mjs/);
  assert.ok(report.missing.includes("gate.js"));
});

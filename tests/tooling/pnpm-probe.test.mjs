import assert from "node:assert/strict";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { probePnpm } from "../../scripts/checks/check-environment.mjs";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

function fixture(t) {
  const caller = createTestEnvironment({ prefix: "d-pi-pnpm-caller-" });
  const probe = createTestEnvironment({ prefix: "d-pi-pnpm-probe-" });
  t.after(() => {
    caller.cleanup();
    probe.cleanup();
  });
  const bin = join(caller.root, "tool bin");
  const cache = join(caller.env.XDG_CACHE_HOME, "node/corepack");
  mkdirSync(bin);
  mkdirSync(cache, { recursive: true });
  const options = {
    cwd: probe.cwd,
    env: {
      ...probe.env,
      COREPACK_ENABLE_NETWORK: "0",
      COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
      COREPACK_DEFAULT_TO_LATEST: "0",
    },
  };
  const callerEnv = {
    ...caller.env,
    PATH: bin,
    FIXTURE_SECRET: "must-not-cross-the-probe-boundary",
  };
  function write(path, content) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
    chmodSync(path, 0o755);
    return path;
  }
  function native(name, version) {
    return write(
      join(bin, name),
      `#!${process.execPath}
if (process.env.FIXTURE_SECRET || process.env.HOME === ${JSON.stringify(caller.home)}) throw Error('caller environment leaked');
process.stdout.write(${JSON.stringify(version)});
`,
    );
  }
  function corepack() {
    const directory = join(bin, "node_modules/corepack");
    write(join(directory, "package.json"), '{"name":"corepack"}');
    return write(
      join(directory, "dist/pnpm.js"),
      `const fs=require('node:fs'),path=require('node:path');
if (process.env.FIXTURE_SECRET || process.env.HOME === ${JSON.stringify(caller.home)}) throw Error('caller environment leaked');
if (process.env.COREPACK_ENABLE_NETWORK !== '0') throw Error('network not disabled');
const project=JSON.parse(fs.readFileSync('package.json','utf8'));
const version=project.packageManager.split('@')[1];
process.stdout.write(fs.readFileSync(path.join(process.env.COREPACK_HOME, version), 'utf8'));
`,
    );
  }
  return { bin, cache, options, callerEnv, write, native, corepack };
}

test("resolves the caller's PATH before the probe's Node-first PATH can shadow pnpm", (t) => {
  const f = fixture(t);
  f.native("pnpm", "12.8.1");
  const report = probePnpm("12.8.1", undefined, f.options, f.callerEnv);
  assert.equal(report.kind, "ran");
  assert.equal(report.output, "12.8.1");
});

test("a missing selected native entry fails instead of falling back to another manager", (t) => {
  const f = fixture(t);
  f.native("pnpm", "12.8.1");
  const report = probePnpm(
    "12.8.1",
    join(f.bin, "missing/pnpm-native"),
    f.options,
    f.callerEnv,
  );
  assert.equal(report.kind, "missing");
});

test("a missing caller PATH manager cannot be replaced by the ambient Node-directory shim", (t) => {
  const f = fixture(t);
  const report = probePnpm("12.8.1", undefined, f.options, f.callerEnv);
  assert.equal(report.kind, "missing");
});

test("Corepack receives the pinned project declaration and tool cache while HOME and secrets stay isolated", (t) => {
  const f = fixture(t);
  f.write(join(f.cache, "12.8.1"), "12.8.1");
  f.write(join(f.cache, "11.24.0"), "11.24.0");
  const report = probePnpm("12.8.1", f.corepack(), f.options, f.callerEnv);
  assert.equal(report.kind, "ran");
  assert.equal(report.output, "12.8.1");
});

test("an explicit Corepack cache is respected without forwarding unrelated caller variables", (t) => {
  const f = fixture(t);
  const custom = join(f.bin, "custom-cache");
  f.write(join(custom, "12.8.1"), "12.8.1");
  const report = probePnpm("12.8.1", f.corepack(), f.options, {
    ...f.callerEnv,
    COREPACK_HOME: custom,
  });
  assert.equal(report.kind, "ran");
  assert.equal(report.output, "12.8.1");
});

test("a missing pinned Corepack cache fails even when a default-version cache exists", (t) => {
  const f = fixture(t);
  f.write(join(f.cache, "11.24.0"), "11.24.0");
  const report = probePnpm("12.8.1", f.corepack(), f.options, f.callerEnv);
  assert.equal(report.kind, "failed");
  assert.match(report.output, /12\.8\.1/);
});

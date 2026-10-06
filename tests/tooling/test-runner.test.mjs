import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const root = resolve(import.meta.dirname, "../..");

function fixture(t) {
  const sandbox = createTestEnvironment();
  t.after(() => sandbox.cleanup());
  const vitest = pathToFileURL(join(root, "node_modules/vitest/dist/index.js"));
  const scripts = join(sandbox.cwd, "scripts/testing");
  mkdirSync(scripts, { recursive: true });
  for (const file of ["test.mjs", "test-environment.mjs"])
    copyFileSync(join(root, "scripts/testing", file), join(scripts, file));
  symlinkSync(join(root, "node_modules"), join(sandbox.cwd, "node_modules"));
  writeFileSync(
    join(sandbox.cwd, "vitest.config.ts"),
    "export default {test:{include:['*.test.mjs']}};\n",
  );
  writeFileSync(
    join(sandbox.cwd, "chosen.test.mjs"),
    `import {it,expect} from ${JSON.stringify(vitest.href)}; it('SELECTED_FIXTURE',()=>expect(1).toBe(1));\n`,
  );
  writeFileSync(
    join(sandbox.cwd, "other.test.mjs"),
    "throw new Error('OUT_OF_SCOPE_FIXTURE');\n",
  );
  const run = (...args) =>
    spawnSync(
      process.execPath,
      [join(scripts, "test.mjs"), "vitest", ...args],
      { cwd: root, env: sandbox.env, encoding: "utf8", timeout: 15000 },
    );
  return { run, directory: sandbox.cwd, vitest };
}

test("a Vitest separator cannot silently discard file filters and run other suites", (t) => {
  const { run } = fixture(t);
  const result = run("--", "chosen.test.mjs");
  assert.equal(result.status, 2, result.stderr || result.stdout);
  assert.match(result.stderr, /do not use --.*pnpm test <files>/);
  assert.doesNotMatch(result.stdout, /OUT_OF_SCOPE_FIXTURE|RUN/);
});

test("direct filters and legal options execute only the selected test", (t) => {
  const { run } = fixture(t);
  const result = run("chosen.test.mjs", "--reporter=verbose");
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /SELECTED_FIXTURE/);
  assert.doesNotMatch(result.stdout + result.stderr, /other.test|OUT_OF_SCOPE/);
});

test("no file filters still run the complete fixture suite", (t) => {
  const { run } = fixture(t);
  const result = run();
  assert.equal(result.status, 1, result.stderr || result.stdout);
  assert.match(result.stdout, /chosen.test.mjs/);
  assert.match(result.stderr, /OUT_OF_SCOPE_FIXTURE/);
});

test("missing filters and failing selected tests keep a nonzero exit", (t) => {
  const { run, directory, vitest } = fixture(t);
  const missing = run("does-not-exist.test.mjs");
  assert.equal(missing.status, 1, missing.stderr || missing.stdout);
  assert.match(missing.stderr + missing.stdout, /No test files found/);
  writeFileSync(
    join(directory, "chosen.test.mjs"),
    `import {it,expect} from ${JSON.stringify(vitest.href)}; it('TARGET_FAILURE',()=>expect(1).toBe(2));\n`,
  );
  const failing = run("chosen.test.mjs");
  assert.equal(failing.status, 1, failing.stderr || failing.stdout);
  assert.match(failing.stdout + failing.stderr, /TARGET_FAILURE/);
  assert.doesNotMatch(failing.stdout + failing.stderr, /OUT_OF_SCOPE/);
});

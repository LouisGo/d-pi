import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  reportOxlintResult,
  runOxlint,
} from "../../scripts/architecture/oxlint-runner.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const designLint = join(repositoryRoot, "scripts/lint-design.mjs");
const designCheck = join(repositoryRoot, "validation/s1/design-check.mjs");
const config = join(repositoryRoot, ".oxlintrc.json");

function fixture(name, files) {
  const directory = mkdtempSync(join(tmpdir(), `d-pi-design-lint-${name}-`));
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(directory, relativePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }
  return directory;
}

function runScript(script, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(repositoryRoot, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
    },
  });
}

// A gate that silently passes when the linter dies is worse than no gate: the
// empty output looks like "no violations". These cases pin the distinction
// between "a rule fired" and "the linter never ran".

test("a killed oxlint is a tooling failure, not a clean lint", () => {
  const result = runOxlint({
    binary: process.execPath,
    args: [
      "-e",
      "process.kill(process.pid, 'SIGTRAP')",
    ],
    cwd: repositoryRoot,
  });
  assert.equal(result.kind, "crashed");
  assert.equal(result.reason, "SIGTRAP");
  assert.equal(reportOxlintResult(result), 1);
});

test("a missing oxlint binary is reported instead of passing", () => {
  const result = runOxlint({
    binary: "oxlint-that-does-not-exist",
    args: ["--version"],
    cwd: repositoryRoot,
  });
  assert.equal(result.kind, "missing");
  assert.equal(reportOxlintResult(result), 1);
});

test("a real violation still fails the gate with the rule name", () => {
  const directory = fixture("violation", {
    "src/modules/files/renderer/invalid.tsx":
      'export function Invalid() { return <div style={{ color: "red" }} />; }\n',
  });
  const result = runScript(designLint, [
    "--root",
    directory,
    "--config",
    config,
  ]);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}${result.stderr}`, /no-inline-styles/);
});

test("the root has no design violation to report", () => {
  const result = runScript(designLint, ["--root", repositoryRoot, "--config", config]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(`${result.stdout}`, /PASS: design lint/);
});

test("the design fixture check names a crash instead of an assertion diff", () => {
  const result = runScript(designCheck, []);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(`${result.stdout}`, /PASS: CSS Modules/);
});

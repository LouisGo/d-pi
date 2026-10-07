import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";
import { parseValidationScenario } from "../../validation/m2/scenario.mjs";

const root = resolve(import.meta.dirname, "../..");
const scenarios = { all: ["--workbench", "--router"], workbench: [] };

test("default validation retains the complete workflow and legacy increments", () => {
  assert.deepEqual(
    parseValidationScenario(["candidate.app", "--router"], scenarios),
    {
      scenario: "all",
      path: "candidate.app",
    },
  );
});

test("scenario selectors work before or after the optional path", () => {
  for (const args of [
    ["--scenario=workbench", "candidate.app"],
    ["candidate.app", "--scenario=workbench"],
  ])
    assert.deepEqual(parseValidationScenario(args, scenarios), {
      scenario: "workbench",
      path: "candidate.app",
    });
});

test("invalid, conflicting or misspelled requests fail instead of broadening coverage", () => {
  for (const args of [
    ["--scenario=workbench", "--router"],
    ["--scenario=focus"],
    ["--scenario=workbench", "--scenario=all"],
    ["--scenario", "workbench"],
    ["--rouetr"],
    ["a.app", "b.app"],
  ])
    assert.throws(() => parseValidationScenario(args, scenarios));
});

test("invalid package scope is rejected before touching a bundle or starting Electron", () => {
  const result = spawnSync(
    process.execPath,
    [
      "validation/m2/package.mjs",
      "/missing/candidate.app",
      "--scenario=workbench",
      "--router",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--router.*workbench/);
  assert.doesNotMatch(result.stderr, /ENOENT|Failure evidence/);
});

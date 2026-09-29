import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const checker = join(repositoryRoot, "scripts/check-i18n-copy.mjs");

function fixture(contents) {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-tooling-coverage-"));
  for (const [relativePath, source] of Object.entries(contents)) {
    const path = join(directory, relativePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, source);
  }
  return directory;
}

test("i18n copy check scans migrated module Renderer files", () => {
  const directory = fixture({
    "src/app/renderer/clean.tsx": "export const clean = true;\n",
    "src/modules/files/renderer/visible.tsx":
      "export function Visible() { return <span>中文文案</span>; }\n",
  });
  const result = spawnSync(process.execPath, [checker, "--root", directory], {
    encoding: "utf8",
  });
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /visible\.tsx/);
});

test("Tailwind source configuration includes migrated Renderer roots", () => {
  const source = readFileSync(
    join(repositoryRoot, "src/app/renderer/styles/tokens.css"),
    "utf8",
  );
  assert.match(source, /@source [^;]*modules\/\*\*\/renderer/);
});

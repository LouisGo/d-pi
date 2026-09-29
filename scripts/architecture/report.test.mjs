import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const report = join(repositoryRoot, "scripts/architecture/report.mjs");

function lines(count, prefix) {
  return `${Array.from({ length: count }, (_, index) => `${prefix}-${index}`).join("\n")}\n`;
}

function writeFixture(directory, relativePath, contents) {
  const path = join(directory, relativePath);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}

test("reports entry, production, test, and CSS size hints separately", () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-structure-report-"));
  writeFixture(
    directory,
    "architecture/modules.json",
    JSON.stringify({
      version: 1,
      sourceRoots: ["src"],
      ownedRoots: ["src/app"],
      modules: {
        app: {
          root: "src/app",
          environments: ["main", "renderer"],
          public: ["main/index.ts", "renderer/main.tsx"],
          dependsOn: { main: [], renderer: [] },
        },
      },
    }),
  );
  writeFixture(directory, "src/app/main/index.ts", lines(151, "entry"));
  writeFixture(directory, "src/app/main/logic.ts", lines(301, "production"));
  writeFixture(directory, "src/app/main/logic.test.ts", lines(801, "test"));
  writeFixture(directory, "src/app/renderer/main.tsx", "export const main = true;\n");
  writeFixture(directory, "src/app/renderer/styles/business.css", lines(501, "css"));

  const result = spawnSync(process.execPath, [report], { cwd: directory, encoding: "utf8" });
  rmSync(directory, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /src\/app\/main\/index\.ts: 151 lines \(entry hint 150\)/);
  assert.match(result.stdout, /src\/app\/main\/logic\.ts: 301 lines \(production hint 300\)/);
  assert.match(result.stdout, /src\/app\/main\/logic\.test\.ts: 801 lines \(test hint 800\)/);
  assert.match(result.stdout, /src\/app\/renderer\/styles\/business\.css: 501 lines \(css hint 500\)/);
});

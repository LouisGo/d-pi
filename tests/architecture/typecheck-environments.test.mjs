import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function runTypecheck(configName, source) {
  const directory = mkdtempSync(
    join(repositoryRoot, ".scratch", "typecheck-environment-"),
  );
  const configPath = join(directory, "tsconfig.json");
  writeFileSync(join(directory, "fixture.ts"), source);
  writeFileSync(
    configPath,
    JSON.stringify({
      extends: resolve(repositoryRoot, configName),
      include: ["fixture.ts"],
    }),
  );
  try {
    return spawnSync(
      process.execPath,
      [
        resolve(repositoryRoot, "node_modules/typescript/bin/tsc"),
        "--noEmit",
        "-p",
        configPath,
      ],
      { encoding: "utf8" },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("core has a dedicated typecheck without DOM or Node ambient types", () => {
  const config = JSON.parse(
    readFileSync(resolve(repositoryRoot, "tsconfig.core.json"), "utf8"),
  );
  assert.deepEqual(config.compilerOptions.lib, ["ES2023"]);
  assert.deepEqual(config.compilerOptions.types, []);
});

test("process-specific typechecks declare their ambient environment explicitly", () => {
  const expected = {
    "tsconfig.renderer.json": {
      lib: ["ES2023", "DOM", "DOM.Iterable"],
      types: ["vite/client"],
    },
    "tsconfig.main.json": { lib: ["ES2023"], types: ["node"] },
    "tsconfig.host.json": { lib: ["ES2023"], types: ["node"] },
    "tsconfig.preload.json": {
      lib: ["ES2023", "DOM", "DOM.Iterable"],
      types: ["node", "vite/client"],
    },
  };
  for (const [name, values] of Object.entries(expected)) {
    const config = JSON.parse(
      readFileSync(resolve(repositoryRoot, name), "utf8"),
    );
    assert.deepEqual(config.compilerOptions.lib, values.lib, name);
    assert.deepEqual(config.compilerOptions.types, values.types, name);
  }
});

test("the real core typecheck rejects DOM globals", () => {
  const result = runTypecheck(
    "tsconfig.core.json",
    "export const root = document.documentElement;\n",
  );
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /document/);
});

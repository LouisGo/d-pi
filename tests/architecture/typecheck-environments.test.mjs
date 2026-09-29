import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");

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

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const checker = join(repositoryRoot, "scripts/architecture/check.mjs");

function fixture(name, files, modules) {
  const directory = mkdtempSync(join(tmpdir(), `d-pi-architecture-${name}-`));
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(directory, relativePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }
  writeFileSync(join(directory, "modules.json"), JSON.stringify({ version: 1, sourceRoot: "src", modules }, null, 2));
  return directory;
}

function run(directory) {
  return spawnSync(process.execPath, [checker, "--config", "modules.json"], { cwd: directory, encoding: "utf8" });
}

function modules({ alphaDependencies = ["beta"], betaDependencies = [] } = {}) {
  return {
    alpha: { root: "src/modules/alpha", environments: ["core"], public: ["core/public.ts"], dependsOn: { core: alphaDependencies } },
    beta: { root: "src/modules/beta", environments: ["contracts", "core"], public: ["contracts/public.ts", "core/public.ts"], dependsOn: { core: betaDependencies } },
  };
}

test("accepts a public type-only cross-module dependency", () => {
  const directory = fixture("valid", {
    "src/modules/alpha/core/public.ts": 'import type { Beta } from "../../beta/contracts/public";\nexport type Alpha = Beta;\n',
    "src/modules/beta/contracts/public.ts": "export type Beta = { ok: true };\n",
    "src/modules/beta/core/public.ts": "export const beta = true;\n",
  }, modules());
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: architecture boundaries/);
});

test("rejects a private cross-module import", () => {
  const directory = fixture("private-entry", {
    "src/modules/alpha/core/public.ts": 'import { secret } from "../../beta/contracts/private";\nexport { secret };\n',
    "src/modules/beta/contracts/public.ts": "export const publicValue = 1;\n",
    "src/modules/beta/contracts/private.ts": "export const secret = 2;\n",
  }, modules());
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-PRIVATE-IMPORT/);
});

test("rejects an unregistered cross-module dependency", () => {
  const directory = fixture("unknown-dependency", {
    "src/modules/alpha/core/public.ts": 'import { publicValue } from "../../beta/contracts/public";\nexport { publicValue };\n',
    "src/modules/beta/contracts/public.ts": "export const publicValue = 1;\n",
  }, modules({ alphaDependencies: [] }));
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-DEPENDENCY/);
});

test("rejects a core import of a Node runtime and a file cycle", () => {
  const environment = fixture("environment", { "src/modules/alpha/core/public.ts": 'import "node:fs";\nexport const value = 1;\n' }, modules({ betaDependencies: [] }));
  const environmentResult = run(environment);
  rmSync(environment, { recursive: true, force: true });
  assert.notEqual(environmentResult.status, 0);
  assert.match(`${environmentResult.stdout}\n${environmentResult.stderr}`, /ARCH-ENVIRONMENT/);

  const cycle = fixture("cycle", {
    "src/modules/alpha/core/public.ts": 'import { beta } from "../../beta/core/public";\nexport const alpha = beta;\n',
    "src/modules/beta/core/public.ts": 'import { alpha } from "../../alpha/core/public";\nexport const beta = alpha;\n',
  }, modules({ betaDependencies: ["alpha"] }));
  const cycleResult = run(cycle);
  rmSync(cycle, { recursive: true, force: true });
  assert.notEqual(cycleResult.status, 0);
  assert.match(`${cycleResult.stdout}\n${cycleResult.stderr}`, /ARCH-CYCLE/);
});

test("rejects production test-helper imports and non-literal dynamic imports", () => {
  const directory = fixture("production-boundary", {
    "src/modules/alpha/core/public.ts": 'import { helper } from "./support.test";\nconst name = globalThis as { moduleName?: string };\nawait import(name.moduleName);\nexport { helper };\n',
    "src/modules/alpha/core/support.test.ts": "export const helper = 1;\n",
  }, { alpha: { root: "src/modules/alpha", environments: ["core"], public: ["core/public.ts"], dependsOn: { core: [] } } });
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-TEST-IMPORT/);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-NONLITERAL-IMPORT/);
});

test("supports flat shared roots and explicit test-only public entries", () => {
  const directory = fixture("flat-root", {
    "src/shared/identity.ts": "export type Identity = { id: string };\n",
    "src/shared/test-fixture.ts": "export const fixture = true;\n",
    "src/modules/alpha/core/public.ts": 'import type { Identity } from "../../../shared/identity";\nexport type Alpha = Identity;\n',
    "src/modules/alpha/core/consumer.test.ts": 'import { fixture } from "../../../shared/test-fixture";\nexport { fixture };\n',
  }, {
    shared: {
      root: "src/shared",
      environments: ["shared"],
      defaultEnvironment: "shared",
      public: ["identity.ts"],
      testPublic: ["test-fixture.ts"],
      dependsOn: [],
    },
    alpha: {
      root: "src/modules/alpha",
      environments: ["core"],
      public: ["core/public.ts"],
      dependsOn: { core: ["shared"] },
      testDependsOn: ["shared"],
    },
  });
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("rejects source files outside configured modules and owned roots", () => {
  const directory = fixture("unowned-source", {
    "src/modules/alpha/core/public.ts": "export const alpha = true;\n",
    "src/other/value.ts": "export const value = true;\n",
  }, { alpha: { root: "src/modules/alpha", environments: ["core"], public: ["core/public.ts"], dependsOn: { core: [] } } });
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-UNOWNED/);
});

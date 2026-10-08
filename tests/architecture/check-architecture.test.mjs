import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const checker = join(repositoryRoot, "scripts/architecture/check.mjs");

function fixture(name, files, modules, options = {}) {
  const directory = mkdtempSync(join(tmpdir(), `d-pi-architecture-${name}-`));
  for (const [relativePath, contents] of Object.entries(files)) {
    const path = join(directory, relativePath);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }
  writeFileSync(
    join(directory, "modules.json"),
    JSON.stringify(
      {
        version: 1,
        root: "src/modules",
        sourceRoots: ["src"],
        ownedRoots: [],
        ...options,
        modules,
      },
      null,
      2,
    ),
  );
  return directory;
}

function run(directory, options = {}) {
  return spawnSync(process.execPath, [checker, "--config", "modules.json"], {
    cwd: directory,
    encoding: "utf8",
    ...options,
  });
}

test("bounds scans of valid regular expressions and preserves following private-import violations", () => {
  const directory = fixture(
    "regex-scan",
    {
      "src/modules/alpha/core/public.ts":
        "export const safe = (input) => !/[?#]/.test(input);\nimport { secret } from '../../beta/core/private';\n",
      "src/modules/beta/core/public.ts": "export const publicValue = 1;\n",
      "src/modules/beta/core/private.ts": "export const secret = 2;\n",
    },
    modules(),
  );
  try {
    const result = run(directory, { timeout: 1000, maxBuffer: 64 * 1024 });
    assert.equal(
      result.error,
      undefined,
      "architecture scanner must terminate within the bounded child process",
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /ARCH-PRIVATE-IMPORT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps imports inside a division expression visible to architecture checks", () => {
  const directory = fixture(
    "division-import",
    {
      "src/modules/alpha/core/public.ts":
        "export const ratio = left / (import('../../beta/core/private'), right) / third;\n",
      "src/modules/beta/core/public.ts": "export const publicValue = 1;\n",
      "src/modules/beta/core/private.ts": "export const secret = 2;\n",
    },
    modules(),
  );
  try {
    const result = run(directory, { timeout: 1000, maxBuffer: 64 * 1024 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /ARCH-PRIVATE-IMPORT/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fails with a parsing error when the native scanner makes no progress", () => {
  const directory = fixture(
    "non-progress",
    {
      "src/modules/alpha/core/public.ts": "export const invalid = #;\n",
    },
    { alpha: modules().alpha },
  );
  try {
    const result = run(directory, { timeout: 1000, maxBuffer: 64 * 1024 });
    assert.equal(
      result.error,
      undefined,
      "non-progress must fail without hanging the checker",
    );
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /ARCH-PARSE.*scanner.*progress/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

function modules({ alphaDependencies = ["beta"], betaDependencies = [] } = {}) {
  return {
    alpha: {
      root: "src/modules/alpha",
      environments: ["core"],
      public: ["core/public.ts"],
      dependsOn: { core: alphaDependencies },
    },
    beta: {
      root: "src/modules/beta",
      environments: ["contracts", "core"],
      public: ["contracts/public.ts", "core/public.ts"],
      dependsOn: { core: betaDependencies },
    },
  };
}

test("public entries must be source files, not directories or prose", () => {
  for (const entry of ["core", "AGENTS.md"]) {
    const directory = fixture(
      "invalid-public-file",
      {
        "src/modules/alpha/core/value.ts": "export const value = true;\n",
        "src/modules/alpha/AGENTS.md": "Module guidance.\n",
      },
      {
        alpha: {
          root: "src/modules/alpha",
          environments: ["core"],
          public: [entry],
          dependsOn: [],
        },
      },
    );
    const result = run(directory);
    rmSync(directory, { recursive: true, force: true });
    assert.equal(
      result.status,
      1,
      `${entry} must fail as a boundary violation`,
    );
    assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-PUBLIC-ENTRY/);
  }
});

test("renderer rejects Electron subpath imports", () => {
  const directory = fixture(
    "renderer-electron-subpath",
    {
      "src/modules/alpha/renderer/public.ts": 'import "electron/common";\n',
    },
    {
      alpha: {
        root: "src/modules/alpha",
        environments: ["renderer"],
        public: ["renderer/public.ts"],
        dependsOn: [],
      },
    },
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-ENVIRONMENT/);
});

test("TanStack React Router is confined to the Renderer environment", () => {
  for (const environment of [
    "contracts",
    "core",
    "main",
    "host",
    "preload",
    "node",
    "omp",
    "shared",
    "renderer",
  ]) {
    const directory = fixture(
      "router-environment",
      {
        [`src/modules/alpha/${environment}/public.ts`]:
          'import "@tanstack/react-router";\n',
      },
      {
        alpha: {
          root: "src/modules/alpha",
          environments: [environment],
          public: [`${environment}/public.ts`],
          dependsOn: [],
        },
      },
    );
    const result = run(directory);
    rmSync(directory, { recursive: true, force: true });
    assert.equal(
      result.status,
      environment === "renderer" ? 0 : 1,
      `${environment}: ${result.stdout}\n${result.stderr}`,
    );
    if (environment !== "renderer")
      assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-ENVIRONMENT/);
  }
});

test("production rejects test packages and helpers in test directories", () => {
  const directory = fixture(
    "production-test-tools",
    {
      "src/modules/alpha/main/public.ts":
        'import "vitest";\nimport "node:test";\nimport "./tests/helper";\n',
      "src/modules/alpha/main/tests/helper.ts":
        "export const fixture = true;\n",
    },
    {
      alpha: {
        root: "src/modules/alpha",
        environments: ["main"],
        public: ["main/public.ts"],
        dependsOn: [],
      },
    },
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 1);
  assert.equal(
    `${result.stdout}\n${result.stderr}`.match(/ARCH-TEST-IMPORT/g)?.length,
    3,
  );
});

test("Effect is limited to execution Host and Main transport, with no unstable ecosystem", () => {
  const { externalImportRules } = JSON.parse(
    readFileSync(join(repositoryRoot, "architecture/modules.json"), "utf8"),
  );
  const cases = [
    ["host/native/session.ts", "effect", true],
    ["main/transport/connection.ts", "effect/Effect", true],
    ["main/runtime/runtime.ts", "effect", false],
    ["renderer/view.ts", "effect/Effect", false],
    ["core/rules.ts", "effect", false],
    ["contracts/dto.ts", "effect", false],
    ["host/native/session.ts", "effect/unstable/rpc", false],
    ["host/native/session.ts", "@effect/platform-node", false],
  ];
  for (const [path, specifier, allowed] of cases) {
    const directory = fixture(
      "effect-boundary",
      {
        [`src/modules/execution/${path}`]: `import "${specifier}";\n`,
      },
      {
        execution: {
          root: "src/modules/execution",
          environments: ["host", "main", "renderer", "core", "contracts"],
          public: [path],
          dependsOn: [],
        },
      },
      { externalImportRules },
    );
    const result = run(directory);
    rmSync(directory, { recursive: true, force: true });
    assert.equal(
      result.status,
      allowed ? 0 : 1,
      `${path} ${specifier}: ${result.stdout}\n${result.stderr}`,
    );
    if (!allowed)
      assert.match(result.stdout + result.stderr, /ARCH-ENVIRONMENT/);
  }
});

test("unreadable manifests are tooling failures, not boundary violations", () => {
  const directory = fixture("unreadable-manifest", {}, {});
  writeFileSync(join(directory, "modules.json"), "{invalid-json");
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 2);
  assert.match(
    `${result.stdout}\n${result.stderr}`,
    /architecture check could not run/,
  );
  assert.doesNotMatch(result.stdout, /PASS/);
});

test("accepts a public type-only cross-module dependency", () => {
  const directory = fixture(
    "valid",
    {
      "src/modules/alpha/core/public.ts":
        'import type { Beta } from "../../beta/contracts/public";\nexport type Alpha = Beta;\n',
      "src/modules/beta/contracts/public.ts":
        "export type Beta = { ok: true };\n",
      "src/modules/beta/core/public.ts": "export const beta = true;\n",
    },
    modules(),
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /PASS: architecture boundaries/);
});

test("rejects a private cross-module import", () => {
  const directory = fixture(
    "private-entry",
    {
      "src/modules/alpha/core/public.ts":
        'import { secret } from "../../beta/contracts/private";\nexport { secret };\n',
      "src/modules/beta/contracts/public.ts": "export const publicValue = 1;\n",
      "src/modules/beta/contracts/private.ts": "export const secret = 2;\n",
    },
    modules(),
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-PRIVATE-IMPORT/);
});

test("rejects an unregistered cross-module dependency", () => {
  const directory = fixture(
    "unknown-dependency",
    {
      "src/modules/alpha/core/public.ts":
        'import { publicValue } from "../../beta/contracts/public";\nexport { publicValue };\n',
      "src/modules/beta/contracts/public.ts": "export const publicValue = 1;\n",
    },
    modules({ alphaDependencies: [] }),
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-DEPENDENCY/);
});

test("rejects a public cross-module entry from the wrong environment", () => {
  const directory = fixture(
    "cross-environment",
    {
      "src/modules/alpha/core/public.ts":
        'import { value } from "../../beta/main/public";\nexport { value };\n',
      "src/modules/alpha/renderer/public.ts":
        'import { value } from "../../beta/main/public";\nexport { value };\n',
      "src/modules/beta/contracts/public.ts": "export type Contract = true;\n",
      "src/modules/beta/main/public.ts": "export const value = 1;\n",
    },
    {
      alpha: {
        root: "src/modules/alpha",
        environments: ["core", "renderer"],
        public: ["core/public.ts", "renderer/public.ts"],
        dependsOn: { core: ["beta"], renderer: ["beta"] },
      },
      beta: {
        root: "src/modules/beta",
        environments: ["contracts", "main"],
        public: ["contracts/public.ts", "main/public.ts"],
        dependsOn: { contracts: [], main: [] },
      },
    },
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.equal(
    `${result.stdout}\n${result.stderr}`.match(/ARCH-ENVIRONMENT/g)?.length,
    2,
  );
});

test("checks the runtime module and rejects Electron in the OMP environment", () => {
  const directory = fixture(
    "runtime-environment",
    {
      "runtime/host.mjs":
        'import { app } from "electron";\nconsole.log(app);\n',
    },
    {
      runtime: {
        root: "runtime",
        environments: ["omp"],
        defaultEnvironment: "omp",
        public: ["host.mjs"],
        dependsOn: [],
      },
    },
    { sourceRoots: ["runtime"] },
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-ENVIRONMENT/);
});

test("rejects forbidden external dependencies in shared, core and OMP environments", () => {
  const cases = [
    {
      name: "shared-node",
      files: {
        "src/shared/public.ts":
          'import "node:fs";\nexport const value = true;\n',
      },
      modules: {
        shared: {
          root: "src/shared",
          environments: ["shared"],
          defaultEnvironment: "shared",
          public: ["public.ts"],
          dependsOn: [],
        },
      },
      expected: "node:fs",
    },
    {
      name: "core-omp-sdk",
      files: {
        "src/modules/alpha/core/public.ts":
          'import "@oh-my-pi/pi-coding-agent";\nexport const value = true;\n',
      },
      modules: {
        alpha: {
          root: "src/modules/alpha",
          environments: ["core"],
          public: ["core/public.ts"],
          dependsOn: { core: [] },
        },
      },
      expected: "@oh-my-pi/pi-coding-agent",
    },
    {
      name: "omp-ui",
      files: {
        "runtime/host.mjs": 'import "react";\nconsole.log("invalid");\n',
      },
      modules: {
        runtime: {
          root: "runtime",
          environments: ["omp"],
          defaultEnvironment: "omp",
          public: ["host.mjs"],
          dependsOn: [],
        },
      },
      options: { sourceRoots: ["runtime"] },
      expected: "react",
    },
  ];

  for (const { name, files, modules, options, expected } of cases) {
    const directory = fixture(name, files, modules, options);
    const result = run(directory);
    rmSync(directory, { recursive: true, force: true });
    assert.notEqual(result.status, 0, `${name} unexpectedly passed`);
    assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-ENVIRONMENT/);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
});

test("allows supported external packages in platform-independent environments", () => {
  const directory = fixture(
    "valid-platform-packages",
    {
      "src/shared/public.ts":
        'import { createIntl } from "@formatjs/intl";\nimport { z } from "zod";\nexport const shared = [createIntl, z.string()];\n',
      "src/modules/alpha/core/public.ts":
        'import { z } from "zod";\nexport const alpha = z.string();\n',
      "src/modules/beta/contracts/public.ts":
        'import { createIntl } from "@formatjs/intl";\nexport const beta = createIntl;\n',
    },
    {
      shared: {
        root: "src/shared",
        environments: ["shared"],
        defaultEnvironment: "shared",
        public: ["public.ts"],
        dependsOn: [],
      },
      alpha: {
        root: "src/modules/alpha",
        environments: ["core"],
        public: ["core/public.ts"],
        dependsOn: { core: [] },
      },
      beta: {
        root: "src/modules/beta",
        environments: ["contracts"],
        public: ["contracts/public.ts"],
        dependsOn: { contracts: [] },
      },
    },
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("rejects a core import of a Node runtime and a file cycle", () => {
  const environment = fixture(
    "environment",
    {
      "src/modules/alpha/core/public.ts":
        'import "node:fs";\nexport const value = 1;\n',
    },
    modules({ betaDependencies: [] }),
  );
  const environmentResult = run(environment);
  rmSync(environment, { recursive: true, force: true });
  assert.notEqual(environmentResult.status, 0);
  assert.match(
    `${environmentResult.stdout}\n${environmentResult.stderr}`,
    /ARCH-ENVIRONMENT/,
  );

  const cycle = fixture(
    "cycle",
    {
      "src/modules/alpha/core/public.ts":
        'import { beta } from "../../beta/core/public";\nexport const alpha = beta;\n',
      "src/modules/beta/core/public.ts":
        'import { alpha } from "../../alpha/core/public";\nexport const beta = alpha;\n',
    },
    modules({ betaDependencies: ["alpha"] }),
  );
  const cycleResult = run(cycle);
  rmSync(cycle, { recursive: true, force: true });
  assert.notEqual(cycleResult.status, 0);
  assert.match(`${cycleResult.stdout}\n${cycleResult.stderr}`, /ARCH-CYCLE/);
});

test("rejects production test-helper imports and non-literal dynamic imports", () => {
  const directory = fixture(
    "production-boundary",
    {
      "src/modules/alpha/core/public.ts":
        'import { helper } from "./support.test";\nconst name = globalThis as { moduleName?: string };\nawait import(name.moduleName);\nexport { helper };\n',
      "src/modules/alpha/core/support.test.ts": "export const helper = 1;\n",
    },
    {
      alpha: {
        root: "src/modules/alpha",
        environments: ["core"],
        public: ["core/public.ts"],
        dependsOn: { core: [] },
      },
    },
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-TEST-IMPORT/);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-NONLITERAL-IMPORT/);
});

test("supports flat shared roots and explicit test-only public entries", () => {
  const directory = fixture(
    "flat-root",
    {
      "src/shared/identity.ts": "export type Identity = { id: string };\n",
      "src/shared/test-fixture.ts": "export const fixture = true;\n",
      "src/modules/alpha/core/public.ts":
        'import type { Identity } from "../../../shared/identity";\nexport type Alpha = Identity;\n',
      "src/modules/alpha/core/consumer.test.ts":
        'import { fixture } from "../../../shared/test-fixture";\nexport { fixture };\n',
    },
    {
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
    },
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("rejects source files outside configured modules and owned roots", () => {
  const directory = fixture(
    "unowned-source",
    {
      "src/modules/alpha/core/public.ts": "export const alpha = true;\n",
      "src/other/value.ts": "export const value = true;\n",
    },
    {
      alpha: {
        root: "src/modules/alpha",
        environments: ["core"],
        public: ["core/public.ts"],
        dependsOn: { core: [] },
      },
    },
  );
  const result = run(directory);
  rmSync(directory, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ARCH-UNOWNED/);
});

test("resolves directory index imports before checking cross-module privacy", () => {
  const directory = fixture(
    "directory-index",
    {
      "src/modules/alpha/core/public.ts":
        'import { beta } from "../../beta/core";\nexport const alpha = beta;\n',
      "src/modules/beta/core/public.ts": "export const beta = true;\n",
      "src/modules/beta/core/index.ts": "export const beta = true;\n",
      "src/modules/beta/contracts/public.ts":
        "export type Beta = { id: string };\n",
    },
    modules(),
  );
  try {
    const result = run(directory);
    assert.notEqual(
      result.status,
      0,
      "a directory must not bypass the private index entry check",
    );
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /ARCH-PRIVATE-IMPORT.*beta\/core\/index\.ts/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("workbench panel primitives stay behind the owned UI adapter", () => {
  const { externalImportRules } = JSON.parse(
    readFileSync(join(repositoryRoot, "architecture/modules.json"), "utf8"),
  );
  for (const [path, allowed] of [
    ["renderer/components/ui/resizable.tsx", true],
    ["renderer/shell/direct-panel.tsx", false],
  ]) {
    const directory = fixture(
      "workbench-panel-boundary",
      { [`src/app/${path}`]: 'import "react-resizable-panels";\n' },
      {
        app: {
          root: "src/app",
          environments: ["renderer"],
          public: [path],
          dependsOn: [],
        },
      },
      { externalImportRules },
    );
    const result = run(directory);
    rmSync(directory, { recursive: true, force: true });
    assert.equal(
      result.status,
      allowed ? 0 : 1,
      `${path}: ${result.stdout}\n${result.stderr}`,
    );
    if (!allowed)
      assert.match(result.stdout + result.stderr, /ARCH-ENVIRONMENT/);
  }
});

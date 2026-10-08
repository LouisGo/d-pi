import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

test("invalidates generated reports when the shared scanner implementation changes", () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-scanner-report-"));
  try {
    writeFixture(
      directory,
      "architecture/modules.json",
      JSON.stringify({
        version: 1,
        sourceRoots: ["src"],
        modules: {
          alpha: {
            root: "src/modules/alpha",
            environments: ["core"],
            public: ["core/public.ts"],
            dependsOn: [],
          },
        },
      }),
    );
    writeFixture(
      directory,
      "src/modules/alpha/core/public.ts",
      "export const alpha = true;\n",
    );
    for (const file of [
      "scripts/architecture/check.mjs",
      "scripts/architecture/report.mjs",
      "scripts/checks/source-tokens.mjs",
    ])
      writeFixture(
        directory,
        file,
        readFileSync(join(repositoryRoot, file), "utf8"),
      );
    symlinkSync(
      join(repositoryRoot, "node_modules"),
      join(directory, "node_modules"),
      "dir",
    );
    const copiedReport = join(directory, "scripts/architecture/report.mjs");
    const output = join(directory, "architecture/dependencies.generated.json");
    const generated = spawnSync(
      process.execPath,
      [copiedReport, "--write", output],
      { cwd: directory, encoding: "utf8", timeout: 1000 },
    );
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    const helper = "scripts/checks/source-tokens.mjs";
    writeFixture(
      directory,
      helper,
      `${readFileSync(join(directory, helper), "utf8")}\n// changed scanner implementation\n`,
    );
    const stale = spawnSync(
      process.execPath,
      [copiedReport, "--check", output],
      { cwd: directory, encoding: "utf8", timeout: 1000 },
    );
    assert.equal(stale.error, undefined);
    assert.equal(
      stale.status,
      1,
      "scanner helper changes must invalidate the recorded inputs hash",
    );
    assert.match(`${stale.stdout}${stale.stderr}`, /STALE/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

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
  writeFixture(
    directory,
    "src/app/renderer/main.tsx",
    "export const main = true;\n",
  );
  writeFixture(
    directory,
    "src/app/renderer/styles/business.css",
    lines(501, "css"),
  );

  const result = spawnSync(process.execPath, [report], {
    cwd: directory,
    encoding: "utf8",
  });
  rmSync(directory, { recursive: true, force: true });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(
    result.stdout,
    /src\/app\/main\/index\.ts: 151 lines \(entry hint 150\)/,
  );
  assert.match(
    result.stdout,
    /src\/app\/main\/logic\.ts: 301 lines \(production hint 300\)/,
  );
  assert.match(
    result.stdout,
    /src\/app\/main\/logic\.test\.ts: 801 lines \(test hint 800\)/,
  );
  assert.match(
    result.stdout,
    /src\/app\/renderer\/styles\/business\.css: 501 lines \(css hint 500\)/,
  );
});

test("separates declared permissions from observed source dependencies and scan gaps", () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-dependency-report-"));
  writeFixture(
    directory,
    "architecture/modules.json",
    JSON.stringify({
      version: 1,
      sourceRoots: ["src"],
      modules: {
        alpha: {
          root: "src/modules/alpha",
          environments: ["core"],
          public: ["core/public.ts"],
          dependsOn: { core: ["beta", "gamma"] },
        },
        beta: {
          root: "src/modules/beta",
          environments: ["core"],
          public: ["core/public.ts"],
          dependsOn: [],
        },
        gamma: {
          root: "src/modules/gamma",
          environments: ["core"],
          public: ["core/public.ts"],
          dependsOn: [],
        },
      },
      unresolved: { allowed: ["^./generated.js$"] },
    }),
  );
  writeFixture(
    directory,
    "src/modules/alpha/core/public.ts",
    'import { beta } from "../../beta/core/public";\nimport "./generated.js";\nexport const alpha = beta;\n',
  );
  writeFixture(
    directory,
    "src/modules/beta/core/public.ts",
    "export const beta = true;\n",
  );
  writeFixture(
    directory,
    "src/modules/gamma/core/public.ts",
    "export const gamma = true;\n",
  );
  try {
    const result = spawnSync(process.execPath, [report], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(
      result.stdout,
      /allowed-dependencies:\n[\s\S]*alpha\/core -> gamma/,
    );
    assert.match(
      result.stdout,
      /actual-dependencies:\n[\s\S]*alpha\/core -> beta\/core/,
    );
    const observed = result.stdout
      .split("actual-dependencies:\n")[1]
      ?.split("unresolved-imports:")[0];
    assert.doesNotMatch(observed ?? "", /alpha\/core -> gamma/);
    assert.match(
      result.stdout,
      /unresolved-imports:\n[\s\S]*\.\/generated\.js.*allowed/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects a generated report after source or permissions change", () => {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-report-freshness-"));
  const manifest = {
    version: 1,
    sourceRoots: ["src"],
    modules: {
      alpha: {
        root: "src/modules/alpha",
        environments: ["core"],
        public: ["core/public.ts"],
        dependsOn: [],
      },
    },
  };
  writeFixture(
    directory,
    "architecture/modules.json",
    JSON.stringify(manifest),
  );
  writeFixture(
    directory,
    "src/modules/alpha/core/public.ts",
    "export const alpha = true;\n",
  );
  try {
    const output = join(directory, "architecture/dependencies.generated.json");
    const generated = spawnSync(process.execPath, [report, "--write", output], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(generated.status, 0, generated.stderr || generated.stdout);
    writeFixture(
      directory,
      "src/modules/alpha/core/public.ts",
      "export const alpha = false;\n",
    );
    const stale = spawnSync(process.execPath, [report, "--check", output], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.notEqual(
      stale.status,
      0,
      "changed source must invalidate the generated report",
    );
    assert.match(
      `${stale.stdout}${stale.stderr}`,
      /STALE|missing generated report/,
    );
    const regenerated = spawnSync(
      process.execPath,
      [report, "--write", output],
      { cwd: directory, encoding: "utf8" },
    );
    assert.equal(
      regenerated.status,
      0,
      regenerated.stderr || regenerated.stdout,
    );
    const fresh = spawnSync(process.execPath, [report, "--check", output], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(fresh.status, 0, fresh.stderr || fresh.stdout);
    manifest.modules.alpha.dependsOn = ["missing"];
    writeFixture(
      directory,
      "architecture/modules.json",
      JSON.stringify(manifest),
    );
    const changedPermission = spawnSync(
      process.execPath,
      [report, "--check", output],
      { cwd: directory, encoding: "utf8" },
    );
    assert.notEqual(changedPermission.status, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createTestEnvironment } from "../../scripts/test-environment.mjs";

function fixture(license) {
  const sandbox = createTestEnvironment({ prefix: "d-pi-license-notices-" });
  const toolDirectory = join(sandbox.root, "tools");
  const dependencyDirectory = join(sandbox.root, "fixture-dependency");
  mkdirSync(toolDirectory);
  mkdirSync(dependencyDirectory);
  writeFileSync(join(dependencyDirectory, "LICENSE.md"), license);
  const graph = JSON.stringify([
    {
      dependencies: {
        fixture: { version: "1.0.0", path: dependencyDirectory },
      },
    },
  ]);
  const pnpm = join(toolDirectory, "pnpm");
  writeFileSync(
    pnpm,
    `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(graph)});\n`,
  );
  chmodSync(pnpm, 0o755);
  const notices = join(sandbox.cwd, "THIRD_PARTY_NOTICES.md");
  writeFileSync(
    notices,
    "# Third-party notices\n\n## Imported source\n\nKeep source attribution.\n\n## Bundled dependencies\n\n### old@0.0.1\n\nReplace old license.\n\n## Official OMP SDK\n\nKeep SDK attribution.\n\n## Bun runtime\n\nKeep Bun attribution.\n",
  );
  return {
    notices,
    cleanup: () => sandbox.cleanup(),
    refresh: () =>
      spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("../../validation/s1/licenses.mjs", import.meta.url),
          ),
        ],
        {
          cwd: sandbox.cwd,
          env: { ...sandbox.env, PATH: `${toolDirectory}:${sandbox.env.PATH}` },
          encoding: "utf8",
          timeout: 10000,
        },
      ),
  };
}

test("refreshes UI dependency notices without deleting the separately bundled SDK and Bun notices", () => {
  const { notices, refresh, cleanup } = fixture("Fixture license text.");
  try {
    const result = refresh();
    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(notices, "utf8");
    assert.match(output, /Keep source attribution\./);
    assert.match(output, /### fixture@1\.0\.0[\s\S]*Fixture license text\./);
    assert.doesNotMatch(output, /old@0\.0\.1|no development tools are shipped/);
    assert.match(output, /## Official OMP SDK\n\nKeep SDK attribution\./);
    assert.match(output, /## Bun runtime\n\nKeep Bun attribution\./);
  } finally {
    cleanup();
  }
});

test("repeated refresh preserves Markdown license headings and code fences without growing the generated section", () => {
  const license =
    "# Fixture License\n\n## Granted rights\n\nPreserve this notice.\n\n```example\n## Literal heading\n```\n";
  const { notices, refresh, cleanup } = fixture(license);
  try {
    const original = readFileSync(notices, "utf8");
    const suffix = original.slice(original.indexOf("## Official OMP SDK"));
    const firstResult = refresh();
    assert.equal(firstResult.status, 0, firstResult.stderr);
    const first = readFileSync(notices, "utf8");
    assert.ok(first.includes(license), "license text must remain verbatim");
    assert.ok(first.endsWith(suffix), "SDK/Bun notices must remain verbatim");
    const secondResult = refresh();
    assert.equal(secondResult.status, 0, secondResult.stderr);
    const second = readFileSync(notices, "utf8");
    assert.equal(second, first, "repeated refresh must be stable");
    assert.equal(second.split("## Granted rights").length - 1, 1);
  } finally {
    cleanup();
  }
});

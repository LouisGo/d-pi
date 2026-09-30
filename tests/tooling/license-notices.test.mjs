import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createTestEnvironment } from "../../scripts/test-environment.mjs";

test("refreshes UI dependency notices without deleting the separately bundled SDK and Bun notices", () => {
  const sandbox = createTestEnvironment({ prefix: "d-pi-license-notices-" });
  const toolDirectory = join(sandbox.root, "tools");
  const dependencyDirectory = join(sandbox.root, "fixture-dependency");
  mkdirSync(toolDirectory);
  mkdirSync(dependencyDirectory);
  writeFileSync(join(dependencyDirectory, "LICENSE"), "Fixture license text.");
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
  try {
    const result = spawnSync(
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
    );
    assert.equal(result.status, 0, result.stderr);
    const output = readFileSync(notices, "utf8");
    assert.match(output, /Keep source attribution\./);
    assert.match(output, /### fixture@1\.0\.0[\s\S]*Fixture license text\./);
    assert.doesNotMatch(output, /old@0\.0\.1|no development tools are shipped/);
    assert.match(output, /## Official OMP SDK\n\nKeep SDK attribution\./);
    assert.match(output, /## Bun runtime\n\nKeep Bun attribution\./);
  } finally {
    sandbox.cleanup();
  }
});

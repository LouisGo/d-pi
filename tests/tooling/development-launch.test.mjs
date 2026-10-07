import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { developmentEnvironment } from "../../scripts/development/environment.mjs";

test("Dev keeps stable App data per checkout and inherits native configuration", () => {
  const env = {
    HOME: "/personal",
    PI_CODING_AGENT_DIR: "/native",
    OMP_PROFILE: "work",
    TOKEN: "fixture",
  };
  const first = developmentEnvironment("/checkouts/one/d-pi", env, "/home");
  const again = developmentEnvironment("/checkouts/one/d-pi", env, "/home");
  const other = developmentEnvironment("/checkouts/two/d-pi", env, "/home");
  assert.equal(first.D_PI_DATA_DIR, again.D_PI_DATA_DIR);
  assert.notEqual(first.D_PI_DATA_DIR, other.D_PI_DATA_DIR);
  assert.notEqual(
    first.D_PI_DATA_DIR,
    "/home/Library/Application Support/d-pi",
  );
  assert.equal(first.HOME, env.HOME);
  assert.equal(first.PI_CODING_AGENT_DIR, env.PI_CODING_AGENT_DIR);
  assert.equal(first.OMP_PROFILE, env.OMP_PROFILE);
  assert.equal(first.TOKEN, env.TOKEN);
  assert.equal(env.D_PI_DATA_DIR, undefined);
});

test("explicit App data is respected; relative paths are rejected before startup", () => {
  assert.equal(
    developmentEnvironment("/repo", { D_PI_DATA_DIR: "/chosen" }, "/home")
      .D_PI_DATA_DIR,
    "/chosen",
  );
  assert.throws(
    () =>
      developmentEnvironment("/repo", { D_PI_DATA_DIR: "relative" }, "/home"),
    /absolute/,
  );
});

test("launcher runs only electron-vite in the selected checkout and propagates failure", () => {
  const root = mkdtempSync(join(tmpdir(), "d-pi-dev-launch-"));
  try {
    const cliDir = join(root, "node_modules/electron-vite/bin");
    mkdirSync(cliDir, { recursive: true });
    writeFileSync(
      join(cliDir, "electron-vite.js"),
      "console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),data:process.env.D_PI_DATA_DIR}));process.exit(7);",
    );
    const modulePath = new URL(
      "../../scripts/development/launch.mjs",
      import.meta.url,
    ).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { launchDevelopment } from ${JSON.stringify(modulePath)}; process.exitCode = launchDevelopment(${JSON.stringify(root)}, ["dev", "--watch"], {D_PI_DATA_DIR: ${JSON.stringify(join(root, "data"))}});`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 7, result.stderr);
    const report = JSON.parse(result.stdout.trim().split("\n").at(-1));
    assert.deepEqual(report.args, ["dev", "--watch"]);
    assert.equal(report.cwd, root);
    assert.equal(report.data, join(root, "data"));
    const invalid = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { launchDevelopment } from ${JSON.stringify(modulePath)}; process.exitCode = launchDevelopment(${JSON.stringify(root)}, ["build"], {});`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(invalid.status, 2);
    assert.doesNotMatch(invalid.stdout, /"args"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

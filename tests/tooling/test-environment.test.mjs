import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { createTestEnvironment } from "../../scripts/test-environment.mjs";

test("isolates every App/OMP path, cwd and future credential names in a real child", () => {
  const sandbox = createTestEnvironment();
  try {
    const child = spawnSync(
      process.execPath,
      [
        "-e",
        "process.stdout.write(JSON.stringify({env:process.env,cwd:process.cwd(),home:require('node:os').homedir()}))",
      ],
      { cwd: sandbox.cwd, env: sandbox.env, encoding: "utf8" },
    );
    assert.equal(child.status, 0, child.stderr);
    const observed = JSON.parse(child.stdout);
    assert.equal(observed.cwd, sandbox.cwd);
    assert.equal(observed.home, sandbox.home);
    for (const key of [
      "HOME",
      "D_PI_DATA_DIR",
      "PI_CODING_AGENT_DIR",
      "PI_CODING_AGENT_SESSION_DIR",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "PWD",
    ])
      assert.ok(observed.env[key].startsWith(sandbox.root));
    for (const key of [
      "OPENAI_API_KEY",
      "DEEPSEEK_API_KEY",
      "FUTURE_PROVIDER_CREDENTIAL",
      "NODE_OPTIONS",
      "ELECTRON_RUN_AS_NODE",
    ])
      assert.equal(observed.env[key], undefined);
    sandbox.cleanup();
    sandbox.cleanup();
    assert.equal(existsSync(sandbox.root), false);
  } finally {
    sandbox.cleanup();
  }
});

test("only explicit fixture credentials enter the environment; isolation paths cannot be overridden", () => {
  const sandbox = createTestEnvironment({
    fixtureEnv: { OPENAI_API_KEY: "fixture" },
  });
  try {
    assert.equal(sandbox.env.OPENAI_API_KEY, "fixture");
  } finally {
    sandbox.cleanup();
  }
  assert.throws(
    () => createTestEnvironment({ fixtureEnv: { HOME: "/personal-home" } }),
    /isolation owns HOME/,
  );
});

test("standard Node test runner drops inherited credentials and the project's extension directory", () => {
  const fixture = createTestEnvironment();
  const file = join(fixture.cwd, "environment.test.mjs");
  writeFileSync(
    file,
    `import assert from 'node:assert/strict'; import { test } from 'node:test'; test('controlled worker', () => { assert.equal(process.env.OPENAI_API_KEY, undefined); assert.equal(process.env.FUTURE_PROVIDER_CREDENTIAL, undefined); assert.notEqual(process.cwd(), ${JSON.stringify(resolve(import.meta.dirname, "../.."))}); assert.ok(process.env.PI_CODING_AGENT_DIR.startsWith(process.env.HOME)); });\n`,
  );
  try {
    const result = spawnSync(
      process.execPath,
      [resolve(import.meta.dirname, "../../scripts/test.mjs"), "node", file],
      {
        cwd: resolve(import.meta.dirname, "../.."),
        env: {
          ...process.env,
          OPENAI_API_KEY: "test-only-sentinel",
          FUTURE_PROVIDER_CREDENTIAL: "test-only-sentinel",
          PI_CODING_AGENT_DIR: "/personal-config",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /controlled worker/);
  } finally {
    fixture.cleanup();
  }
});

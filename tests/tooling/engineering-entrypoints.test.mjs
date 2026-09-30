import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../..");

test("the fast hook entry includes current status without native preparation or full test work", () => {
  const { scripts } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  assert.match(scripts["check:fast"], /pnpm check:status/);
  assert.match(scripts.check, /pnpm check:status/);
  assert.doesNotMatch(
    scripts["check:fast"],
    /runtime:|check:environment|\btypecheck\b|\bbuild\b|\btest(?::|\b)/,
  );
  assert.match(scripts["hooks:install"], /git-hooks\.mjs install$/);
  assert.match(scripts["hooks:uninstall"], /git-hooks\.mjs uninstall$/);
});

test("CI prepares native resources and reuses the local checks on macOS arm64", () => {
  const workflow = readFileSync(
    join(root, ".github/workflows/check.yml"),
    "utf8",
  );
  assert.match(workflow, /runs-on: macos-14/);
  assert.doesNotMatch(workflow, /runs-on: (?:ubuntu|windows)/);
  assert.match(workflow, /process\.platform.*darwin.*process\.arch.*arm64/);
  assert.match(workflow, /node-version-file: \.node-version/);
  assert.doesNotMatch(workflow, /D_PI_NATIVE_SMOKE/);
  const commands = [
    "pnpm install --frozen-lockfile",
    "pnpm exec install-electron",
    "pnpm runtime:sdk",
    "pnpm check:environment",
    "pnpm validate:sdk",
    "pnpm check",
    "pnpm build",
  ];
  let previous = -1;
  for (const command of commands) {
    const position = workflow.indexOf(`run: ${command}\n`);
    assert.ok(
      position > previous,
      `missing or out-of-order local entry: ${command}`,
    );
    previous = position;
  }
  const actions = [...workflow.matchAll(/uses: ([\w/-]+)@(\S+)/g)];
  assert.equal(actions.length, 3);
  for (const [, action, revision] of actions)
    assert.match(
      revision,
      /^[a-f\d]{40}$/,
      `${action} must be pinned to a reviewed commit`,
    );
  const { scripts } = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  assert.match(
    scripts["validate:sdk"],
    /sdk-control\.mjs.*&&.*sdk-failure\.mjs/,
  );
});

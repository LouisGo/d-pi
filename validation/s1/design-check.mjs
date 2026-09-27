import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const run = (name) =>
  spawnSync(
    "pnpm",
    [
      "exec",
      "oxlint",
      "-c",
      ".oxlintrc.json",
      `validation/s1/fixtures/${name}.tsx`,
    ],
    { encoding: "utf8" },
  );
const good = run("good");
assert.equal(good.status, 0, good.stdout + good.stderr);
const bad = run("bad");
assert.equal(bad.status, 1, bad.stdout + bad.stderr);
for (const rule of [
  "no-raw-colors",
  "no-arbitrary-values",
  "no-restyle",
  "no-inline-styles",
  "no-unknown-classes",
  "require-static-classes",
]) {
  assert.ok((bad.stdout + bad.stderr).includes(rule), `missing ${rule}`);
}
console.log(
  "PASS: CSS Modules, clsx/cva, shared variable accepted; six invalid design patterns rejected.",
);

import assert from "node:assert/strict";
import { resolve } from "node:path";
import { runOxlint } from "../../scripts/architecture/oxlint-runner.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const config = resolve(repositoryRoot, ".oxlintrc.json");

function run(name) {
  const result = runOxlint({
    args: ["-c", config, `validation/s1/fixtures/${name}.tsx`],
    cwd: repositoryRoot,
  });
  // Assert the tool actually ran: a crashed or missing oxlint returns an empty
  // output that would otherwise read as "no violations found".
  assert.equal(
    result.kind,
    "ran",
    `design lint did not run (${result.kind}: ${result.reason ?? ""})\n${result.output}`,
  );
  return result;
}

const good = run("good");
assert.equal(good.status, 0, good.output);
const bad = run("bad");
assert.equal(bad.status, 1, bad.output);
for (const rule of [
  "no-raw-colors",
  "no-arbitrary-values",
  "no-restyle",
  "no-inline-styles",
  "no-unknown-classes",
  "require-static-classes",
]) {
  assert.ok(bad.output.includes(rule), `missing ${rule}`);
}
console.log(
  "PASS: CSS Modules, clsx/cva, shared variable accepted; six invalid design patterns rejected.",
);

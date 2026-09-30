import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { checkDocumentation } from "../../scripts/check-documentation.mjs";

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "d-pi-doc-gate-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

test("reports missing local Markdown and skill targets, while preserving raw historical links", (t) => {
  const root = fixture(t, {
    "README.md":
      "[missing](docs/missing.md) [skill](.agents/skills/missing/SKILL.md)\n[web](https://example.org/missing.md)\n",
    "docs/archive/pre-reset/evidence.md":
      "[old machine](/Users/original/missing.md)\n",
  });
  const result = checkDocumentation(root, [
    "README.md",
    "docs/archive/pre-reset/evidence.md",
  ]);
  assert.equal(result.checked, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.issues.length, 2);
  assert.match(result.issues.join("\n"), /DOC-LINK.*missing\/SKILL\.md/);
});

test("checks Unicode and duplicate heading anchors, same-page links, and reference links", (t) => {
  const root = fixture(t, {
    "README.md":
      "[good](docs/contract.md#恢复顺序2026-09-30) [duplicate](docs/contract.md#恢复顺序2026-09-30-1)\n[bad][contract]\n[contract]: docs/contract.md#missing\n[same](#missing)\n",
    "docs/contract.md": "# 恢复顺序（2026-09-30）\n# 恢复顺序（2026-09-30）\n",
  });
  const result = checkDocumentation(root, ["README.md", "docs/contract.md"]);
  assert.equal(result.issues.length, 2);
  assert.match(result.issues.join("\n"), /DOC-ANCHOR.*#missing/);
  assert.doesNotMatch(result.issues.join("\n"), /#恢复顺序/);
});

test("rejects unknown D-IDs without interpreting prose or fenced historical examples", (t) => {
  const root = fixture(t, {
    "docs/decisions.md":
      "| D-24 | existing policy |\n| D-37 | existing policy |\n",
    "README.md":
      "沿用 D-24 和 D-37。错误引用 D-99。\n```md\n示例 D-88 [example](missing.md)\n```\n",
  });
  const result = checkDocumentation(root, ["README.md", "docs/decisions.md"]);
  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0], /DOC-DECISION.*D-99/);
});

test("CLI checks new untracked entries while excluding raw evidence and experimental fixtures", (t) => {
  const root = fixture(t, {
    "README.md": "[new broken entry](docs/new-missing.md)\n",
    "docs/archive/pre-reset/evidence.md":
      "[historical](/old-machine/missing.md)\n",
    ".scratch/experiment/fixtures/sample.md": "[sample](missing.md)\n",
    "validation/s1/paste/sample.md": "[sample](missing.md)\n",
  });
  const initialized = spawnSync(
    "git",
    ["init", "--quiet", "--template=", root],
    { encoding: "utf8" },
  );
  assert.equal(initialized.status, 0, initialized.stderr);
  const result = spawnSync(
    process.execPath,
    [
      resolve(import.meta.dirname, "../../scripts/check-documentation.mjs"),
      "--root",
      root,
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DOC-LINK.*README\.md.*new-missing\.md/);
  assert.doesNotMatch(
    result.stderr,
    /old-machine|fixtures\/sample|paste\/sample/,
  );
});

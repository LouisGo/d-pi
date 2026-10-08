import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../../validation/s1/source-boundaries.mjs", import.meta.url),
);
function check(t, style) {
  const root = mkdtempSync(join(tmpdir(), "dpi-source-token-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const styles = join(root, "src/app/renderer/styles");
  mkdirSync(styles, { recursive: true });
  writeFileSync(
    join(styles, "tokens.css"),
    ":root { --surface: #fff; --foreground: #222; }",
  );
  writeFileSync(join(styles, "component.css"), style);
  return spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });
}
test("accepts a private alias whose entire value comes from the shared token source", (t) => {
  const result = check(
    t,
    ".badge { --badge-color: var(--foreground); color: var(--badge-color); }",
  );
  assert.equal(result.status, 0, result.stderr);
});
test("keeps rejecting independent values, undeclared references and component overrides of shared tokens", (t) => {
  for (const style of [
    ".badge { --badge-color: #fff; }",
    ".badge { --badge-color: 7px; }",
    ".badge { --badge-color: var(--unknown); }",
    ".badge { --surface: var(--foreground); }",
    ".badge { --badge-color: var(--foreground, #fff); }",
  ]) {
    const result = check(t, style);
    assert.notEqual(result.status, 0, style);
  }
});

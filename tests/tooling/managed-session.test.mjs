import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

test("materializes the same official SDK session before exposing a binding, including empty cold restart", () => {
  const result = spawnSync(
    resolve(import.meta.dirname, "../../node_modules/bun/bin/bun.exe"),
    [resolve(import.meta.dirname, "probe-managed-session.mjs")],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

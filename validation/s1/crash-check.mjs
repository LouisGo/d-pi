import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import electron from "electron";

const dir = mkdtempSync(join(tmpdir(), "d-pi-crash-"));
try {
  const path = join(dir, "probe.sqlite");
  let db = new DatabaseSync(path);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE draft(body TEXT); INSERT INTO draft VALUES ('confirmed');",
  );
  db.close();
  const child = spawnSync(electron, ["validation/s1/crash-child.cjs"], {
    env: { ...process.env, D_PI_PROBE_DB: path },
    encoding: "utf8",
    timeout: 20000,
  });
  assert.ok(child.stdout.includes("transaction-open"), child.stderr);
  assert.equal(child.signal, "SIGKILL");
  db = new DatabaseSync(path);
  assert.equal(db.prepare("SELECT body FROM draft").get().body, "confirmed");
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  db.close();
  console.log(
    "PASS: SIGKILL during Electron transaction recovered confirmed data; integrity_check=ok.",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

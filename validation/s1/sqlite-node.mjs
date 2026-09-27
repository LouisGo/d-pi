// Same SQL primitives as the Electron probe; this does not establish Electron compatibility.

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = mkdtempSync(join(tmpdir(), "d-pi-node-sqlite-"));
try {
  const db = new DatabaseSync(join(dir, "probe.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE draft (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, body TEXT NOT NULL); INSERT INTO draft VALUES ('a', 0, 'first');",
  );
  const update = db.prepare(
    "UPDATE draft SET body=?, revision=revision+1 WHERE id=? AND revision=?",
  );
  assert.equal(update.run("second", "a", 0).changes, 1);
  assert.equal(update.run("stale", "a", 0).changes, 0);
  db.exec("BEGIN IMMEDIATE; UPDATE draft SET body='interrupted'; ROLLBACK");
  assert.equal(db.prepare("SELECT body FROM draft").get().body, "second");
  db.close();
  console.log(
    "PASS: Node-only CAS and transaction rollback (Electron evidence required separately).",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

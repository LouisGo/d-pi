const { app } = require("electron");
const { DatabaseSync } = require("node:sqlite");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const assert = require("node:assert/strict");
app
  .whenReady()
  .then(() => {
    const dir = mkdtempSync(join(tmpdir(), "d-pi-s1-sqlite-"));
    const path = join(dir, "probe.sqlite");
    try {
      let db = new DatabaseSync(path);
      db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; CREATE TABLE draft(id TEXT PRIMARY KEY, revision INTEGER, body TEXT); INSERT INTO draft VALUES ('a',0,'已落盘');",
      );
      db.exec("BEGIN IMMEDIATE; UPDATE draft SET body='未提交'; ROLLBACK;");
      assert.equal(db.prepare("SELECT body FROM draft").get().body, "已落盘");
      db.exec("PRAGMA query_only=ON");
      assert.throws(() => db.exec("UPDATE draft SET body='失败'"));
      db.exec("PRAGMA query_only=OFF; BEGIN IMMEDIATE;");
      try {
        db.exec(
          "ALTER TABLE draft ADD COLUMN extra TEXT; INVALID MIGRATION; PRAGMA user_version=1; COMMIT;",
        );
      } catch {
        db.exec("ROLLBACK");
      }
      assert.equal(db.prepare("PRAGMA user_version").get().user_version, 0);
      assert.equal(db.prepare("PRAGMA table_info(draft)").all().length, 3);
      db.close();
      db = new DatabaseSync(path);
      assert.equal(db.prepare("SELECT body FROM draft").get().body, "已落盘");
      console.log(
        JSON.stringify({
          status: "passed",
          versions: process.versions,
          tests: [
            "rollback",
            "readonly-write-failure",
            "migration-rollback",
            "reopen",
          ],
          sqlite: db.prepare("SELECT sqlite_version() AS version").get()
            .version,
        }),
      );
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
      app.quit();
    }
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });

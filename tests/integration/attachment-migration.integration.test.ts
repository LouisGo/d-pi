import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";

it("migrates attachment manifests after receipt recovery and reopens without losing them", () => {
  const dir = mkdtempSync(join(tmpdir(), "dpi-content-schema-"));
  const path = join(dir, "app.sqlite");
  let store = AppStorage.open(path);
  try {
    const draft = store.drafts.create(dir);
    const db = new DatabaseSync(path);
    expect(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='input_attachment'")
        .get(),
    ).toEqual({ name: "input_attachment" });
    db.prepare("INSERT INTO input_attachment VALUES(?,?,?)").run(
      "attachment",
      draft.threadId,
      "{}",
    );
    db.close();
    store.close();
    store = AppStorage.open(path);
    const reopened = new DatabaseSync(path);
    expect(reopened.prepare("SELECT id FROM input_attachment").get()).toEqual({
      id: "attachment",
    });
    expect(reopened.prepare("PRAGMA user_version").get()?.user_version).toBe(9);
    reopened.close();
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

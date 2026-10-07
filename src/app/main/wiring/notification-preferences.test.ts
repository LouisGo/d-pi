import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { AppStorage } from "./app-storage";

it("migrates schema10 after recovery, preserving legacy preferences and backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-notifications-"));
  const path = join(dir, "app.sqlite");
  try {
    const prior = new DatabaseSync(path);
    prior.exec(`CREATE TABLE desktop(id INTEGER PRIMARY KEY,theme TEXT,density TEXT,send_key TEXT,locale TEXT);
      INSERT INTO desktop VALUES(1,'dark','compact','enter-newline','en-US');
      CREATE TABLE submission(id TEXT PRIMARY KEY,thread_id TEXT,receipt TEXT);
      CREATE TABLE queue_change(id TEXT PRIMARY KEY,thread_id TEXT,record TEXT);
      PRAGMA user_version=10;`);
    prior.close();
    const store = AppStorage.open(path);
    expect(store.preferences.readNotifications()).toEqual({
      system: false,
      completion: false,
    });
    store.preferences.saveNotifications({ system: true, completion: true });
    store.preferences.save({
      theme: "light",
      density: "normal",
      locale: "zh-CN",
    });
    store.preferences.saveLocale("zh-CN");
    expect(store.preferences.readNotifications()).toEqual({
      system: true,
      completion: true,
    });
    expect(store.preferences.read()).toEqual({
      theme: "light",
      density: "compact",
      locale: "zh-CN",
      sendKey: undefined,
    });
    store.close();
    const reopened = AppStorage.open(path);
    expect(reopened.preferences.readNotifications()).toEqual({
      system: true,
      completion: true,
    });
    reopened.close();
    const backup = new DatabaseSync(`${path}.before-v11`, { readOnly: true });
    expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(10);
    expect(
      backup.prepare("SELECT theme,density,send_key,locale FROM desktop").get(),
    ).toEqual({
      theme: "dark",
      density: "compact",
      send_key: "enter-newline",
      locale: "en-US",
    });
    backup.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
it("normalizes interrupted receipt before publishing the v11 backup", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-notification-recovery-")),
    path = join(dir, "app.sqlite");
  try {
    const prior = new DatabaseSync(path);
    prior.exec(
      `CREATE TABLE desktop(id INTEGER PRIMARY KEY,theme TEXT,density TEXT,send_key TEXT,locale TEXT);INSERT INTO desktop VALUES(1,'dark','compact',NULL,'system');CREATE TABLE submission(id TEXT PRIMARY KEY,thread_id TEXT,receipt TEXT);CREATE TABLE queue_change(id TEXT PRIMARY KEY,thread_id TEXT,record TEXT);PRAGMA user_version=10;`,
    );
    const receipt = {
      submissionId: randomUUID(),
      threadId: randomUUID(),
      traceId: randomUUID(),
      revision: 0,
      text: "retained user draft",
      target: {
        processInstanceId: randomUUID(),
        connectionGeneration: randomUUID(),
        configContextId: "existing-context",
        nativeSessionRef: "existing-session",
      },
      requestId: randomUUID(),
      createdAt: "2026-10-06T00:00:00Z",
      updatedAt: "2026-10-06T00:00:00Z",
      state: "dispatching",
      acknowledgedAt: null,
      outcome: "unobserved",
    };
    prior
      .prepare("INSERT INTO submission VALUES(?,?,?)")
      .run(receipt.submissionId, receipt.threadId, JSON.stringify(receipt));
    prior.close();
    const store = AppStorage.open(path);
    expect(store.submissions.submission(receipt.submissionId)).toMatchObject({
      state: "unknown",
      outcome: "unknown",
      acknowledgedAt: null,
    });
    store.close();
    const backup = new DatabaseSync(`${path}.before-v11`, { readOnly: true });
    expect(
      backup
        .prepare(
          "SELECT json_extract(receipt,'$.state') AS state FROM submission",
        )
        .get()?.state,
    ).toBe("unknown");
    expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(10);
    backup.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

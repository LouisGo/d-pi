import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { PreferencesSchema } from "../../../modules/preferences/contracts/public";
import { AppStorage } from "./app-storage";
import { DesktopCommandService } from "./desktop-command-service";

it("migrates v12 and persists picker preferences across restart without changing locale or notifications", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-picker-preferences-"));
  const path = join(dir, "app.sqlite");
  try {
    const prior = new DatabaseSync(path);
    prior.exec(`
      CREATE TABLE desktop(id INTEGER PRIMARY KEY,theme TEXT,density TEXT,send_key TEXT,locale TEXT,notification_system INTEGER,notification_completion INTEGER);
      INSERT INTO desktop VALUES(1,'dark','compact','enter-newline','en-US',1,0);
      CREATE TABLE submission(id TEXT PRIMARY KEY,thread_id TEXT,receipt TEXT);
      CREATE TABLE queue_change(id TEXT PRIMARY KEY,thread_id TEXT,record TEXT);
      PRAGMA user_version=12;
    `);
    prior.close();
    const store = AppStorage.open(path);
    expect(store.preferences.read()).not.toHaveProperty("modelPicker");
    const modelPicker = {
      favorites: ['["openai-codex","gpt-fixture"]'],
      hidden: ['["temporary-provider","temporarily-missing"]'],
      order: ['["deepseek","deepseek-fixture"]'],
    };
    const value = PreferencesSchema.parse({
      ...store.preferences.read(),
      theme: "light",
      locale: "zh-CN",
      modelPicker,
    });
    store.preferences.save(value);
    store.close();
    const reopened = AppStorage.open(path);
    expect(reopened.preferences.read()).toEqual({
      theme: "light",
      density: "compact",
      sendKey: "enter-newline",
      locale: "en-US",
      modelPicker,
    });
    expect(reopened.preferences.readNotifications()).toEqual({
      system: true,
      completion: false,
    });
    expect(
      reopened.database.connection.prepare("PRAGMA user_version").get()
        ?.user_version,
    ).toBe(13);
    reopened.close();
    const backup = new DatabaseSync(`${path}.before-v13`, { readOnly: true });
    expect(backup.prepare("PRAGMA user_version").get()?.user_version).toBe(12);
    expect(backup.prepare("SELECT theme,locale FROM desktop").get()).toEqual({
      theme: "dark",
      locale: "en-US",
    });
    backup.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("preserves schema 12 and the user's draft if publishing the v13 backup fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-picker-migration-failure-"));
  const path = join(dir, "app.sqlite");
  try {
    const store = AppStorage.open(path);
    const draft = store.drafts.create(dir);
    store.drafts.save(
      draft.threadId,
      0,
      "precious draft before picker upgrade",
    );
    store.close();
    const prior = new DatabaseSync(path);
    prior.exec("DROP TABLE model_picker_preferences; PRAGMA user_version=12;");
    prior.close();
    rmSync(`${path}.before-v13`);
    mkdirSync(`${path}.before-v13`);
    expect(() => AppStorage.open(path)).toThrow();
    const retained = new DatabaseSync(path, { readOnly: true });
    try {
      expect(retained.prepare("PRAGMA user_version").get()?.user_version).toBe(
        12,
      );
      expect(
        retained
          .prepare("SELECT body FROM thread WHERE id=?")
          .get(draft.threadId)?.body,
      ).toBe("precious draft before picker upgrade");
      expect(
        retained
          .prepare(
            "SELECT name FROM sqlite_master WHERE name='model_picker_preferences'",
          )
          .get(),
      ).toBeUndefined();
    } finally {
      retained.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("preserves picker preferences when a legacy save omits them and rolls back every preference on SQLite failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-picker-atomic-"));
  const path = join(dir, "app.sqlite");
  const store = AppStorage.open(path);
  try {
    const modelPicker = {
      favorites: ["favorite"],
      hidden: ["hidden"],
      order: [],
    };
    store.preferences.save({ ...store.preferences.read(), modelPicker });
    store.preferences.saveLocale("zh-CN");
    store.preferences.saveNotifications({ system: true, completion: true });
    store.preferences.save({
      theme: "dark",
      density: "compact",
      sendKey: "enter-newline",
      locale: "system",
    });
    expect(store.preferences.read()).toEqual({
      theme: "dark",
      density: "normal",
      sendKey: "enter-newline",
      locale: "zh-CN",
      modelPicker,
    });
    store.database.connection.exec(`
      CREATE TRIGGER reject_picker_update BEFORE UPDATE ON model_picker_preferences
      BEGIN SELECT RAISE(ABORT,'fixture persistence unavailable'); END;
    `);
    const before = store.preferences.read();
    const service = new DesktopCommandService(store, async () => null);
    const failed = await service.execute({
      kind: "preferences",
      traceId: crypto.randomUUID(),
      value: {
        ...before,
        theme: "light",
        sendKey: "enter-send",
        modelPicker: { favorites: [], hidden: [], order: ["new"] },
      },
    });
    expect(failed).toMatchObject({ kind: "failed" });
    expect(store.preferences.read()).toEqual(before);
    expect(store.preferences.readNotifications()).toEqual({
      system: true,
      completion: true,
    });
    store.close();
    const reopened = AppStorage.open(path);
    expect(reopened.preferences.read()).toEqual(before);
    reopened.close();
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

it("returns actual persisted preferences after a legacy save rather than echoing stale locale or missing picker data", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-picker-readback-"));
  const store = AppStorage.open(join(dir, "app.sqlite"));
  try {
    const modelPicker = { favorites: ["existing"], hidden: [], order: [] };
    store.preferences.save({ ...store.preferences.read(), modelPicker });
    store.preferences.saveLocale("zh-CN");
    const service = new DesktopCommandService(store, async () => null);
    const reply = await service.execute({
      kind: "preferences",
      traceId: crypto.randomUUID(),
      value: { theme: "dark", density: "compact", locale: "system" },
    });
    expect(reply).toEqual({
      kind: "preferences-saved",
      value: {
        theme: "dark",
        density: "normal",
        sendKey: undefined,
        locale: "zh-CN",
        modelPicker,
      },
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

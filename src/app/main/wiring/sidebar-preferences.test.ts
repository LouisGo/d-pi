import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { AppStorage } from "./app-storage";
import { DesktopCommandService } from "./desktop-command-service";

function fixture(run: (path: string, dir: string) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), "dpi-sidebar-"));
  return run(join(dir, "app.sqlite"), dir).finally(() =>
    rmSync(dir, { recursive: true, force: true }),
  );
}
it("persists mixed pins, manual ordering and collapsed state across restart without changing drafts/preferences", () =>
  fixture(async (path, dir) => {
    const store = AppStorage.open(path);
    const a = store.threads.create(dir);
    const b = store.threads.create(dir);
    const service = new DesktopCommandService(store, async () => null);
    const change = async (
      value: Parameters<typeof store.preferences.changeSidebar>[1],
    ) =>
      service.execute({
        kind: "sidebar-change",
        traceId: crypto.randomUUID(),
        change: value,
      });
    await change({
      kind: "pin",
      item: { kind: "project", id: a.workingDirectoryId },
      value: true,
    });
    await change({
      kind: "pin",
      item: { kind: "thread", id: a.threadId },
      value: true,
    });
    await change({
      kind: "move-thread",
      projectId: a.workingDirectoryId,
      id: b.threadId,
      before: null,
    });
    await change({
      kind: "collapse-project",
      id: a.workingDirectoryId,
      value: true,
    });
    const before = store.preferences.readSidebar();
    expect(before.value.pins).toHaveLength(2);
    store.close();
    const reopened = AppStorage.open(path);
    try {
      expect(reopened.preferences.readSidebar()).toEqual(before);
      expect(reopened.drafts.read(a.threadId).text).toBe("");
      expect(reopened.preferences.read().theme).toBe("light");
    } finally {
      reopened.close();
    }
  }));
it("rejects unknown IDs and cross-project moves; SQLite failures roll back and later intents read current state", () =>
  fixture(async (path, dir) => {
    const store = AppStorage.open(path);
    try {
      const a = store.threads.create(dir);
      const b = store.threads.create(`${dir}/other`);
      const service = new DesktopCommandService(store, async () => null);
      const apply = (
        change: Parameters<typeof store.preferences.changeSidebar>[1],
      ) =>
        service.execute({
          kind: "sidebar-change",
          traceId: crypto.randomUUID(),
          change,
        });
      expect(
        await apply({
          kind: "move-thread",
          projectId: a.workingDirectoryId,
          id: b.threadId,
          before: null,
        }),
      ).toMatchObject({ kind: "failed" });
      expect(
        await apply({
          kind: "pin",
          item: { kind: "thread", id: crypto.randomUUID() },
          value: true,
        }),
      ).toMatchObject({ kind: "failed" });
      await apply({
        kind: "pin",
        item: { kind: "project", id: a.workingDirectoryId },
        value: true,
      });
      const before = store.preferences.readSidebar();
      store.database.connection.exec(
        "CREATE TRIGGER reject_sidebar BEFORE UPDATE ON sidebar_preferences BEGIN SELECT RAISE(ABORT,'fixture unavailable'); END;",
      );
      expect(
        await apply({
          kind: "pin",
          item: { kind: "thread", id: a.threadId },
          value: true,
        }),
      ).toMatchObject({ kind: "failed" });
      expect(store.preferences.readSidebar()).toEqual(before);
      store.database.connection.exec("DROP TRIGGER reject_sidebar;");
      await apply({
        kind: "pin",
        item: { kind: "thread", id: a.threadId },
        value: true,
      });
      expect(store.preferences.readSidebar().value.pins).toHaveLength(2);
    } finally {
      store.close();
    }
  }));
it("backs up v14 before migration and leaves it intact when publishing the backup fails", () =>
  fixture(async (path, dir) => {
    const store = AppStorage.open(path);
    const draft = store.threads.create(dir);
    store.drafts.save(draft.threadId, 0, "retained");
    store.close();
    const prior = new DatabaseSync(path);
    prior.exec(
      "DROP TABLE IF EXISTS thread_management; DROP TABLE IF EXISTS sidebar_preferences; PRAGMA user_version=14;",
    );
    prior.close();
    rmSync(`${path}.before-v15`, { force: true });
    mkdirSync(`${path}.before-v15`);
    expect(() => AppStorage.open(path)).toThrow();
    const retained = new DatabaseSync(path, { readOnly: true });
    try {
      expect(retained.prepare("PRAGMA user_version").get()?.user_version).toBe(
        14,
      );
      expect(
        retained
          .prepare("SELECT body FROM thread WHERE id=?")
          .get(draft.threadId)?.body,
      ).toBe("retained");
    } finally {
      retained.close();
    }
  }));

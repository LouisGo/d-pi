import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DraftService } from "./draft-service";
import { DraftStorage } from "./storage";

function fixture(
  run: (path: string, dir: string) => void | Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-core-"));
  return Promise.resolve()
    .then(() => run(join(dir, "app.sqlite"), dir))
    .finally(() => rmSync(dir, { recursive: true, force: true }));
}
describe("real SQLite and directory service", () => {
  it("stable identities, two threads, CAS and restart", () =>
    fixture((path) => {
      let store = new DraftStorage(path);
      const a = store.create("/a");
      const b = store.create("/a");
      expect(a.threadId).not.toBe(b.threadId);
      expect(a.workspaceId).toBe(b.workspaceId);
      expect(store.save(a.threadId, 0, "a body")).toBe(1);
      expect(store.save(a.threadId, 0, "stale")).toBeNull();
      expect(store.read(b.threadId).text).toBe("");
      store.close();
      store = new DraftStorage(path);
      expect(store.read(a.threadId)).toEqual({
        ...a,
        revision: 1,
        text: "a body",
      });
      expect(store.active()?.threadId).toBe(b.threadId);
      store.close();
    }));
  it("cancel/invalid directory does not associate a thread; foreign ID cannot write", () =>
    fixture(async (path, dir) => {
      const store = new DraftStorage(path);
      let selected: string | null = null;
      const service = new DraftService(store, async () => selected);
      const traceId = crypto.randomUUID();
      expect(
        await service.execute({ kind: "choose-project", traceId }),
      ).toEqual({ kind: "cancelled" });
      expect(store.active()).toBeNull();
      selected = join(dir, "missing");
      expect(
        (await service.execute({ kind: "choose-project", traceId })).kind,
      ).toBe("failed");
      expect(store.active()).toBeNull();
      selected = dir;
      expect(
        (await service.execute({ kind: "choose-project", traceId })).kind,
      ).toBe("ready");
      const old = store.active();
      const newDraft = store.create(dir);
      if (!old) throw Error("missing");
      expect(
        (
          await service.execute({
            kind: "save",
            traceId,
            threadId: old.threadId,
            expectedRevision: 0,
            text: "wrong",
          })
        ).kind,
      ).toBe("failed");
      expect(store.read(newDraft.threadId).text).toBe("");
      store.close();
    }));
  it("migration failure retains original DB and rollback; future schema is not reset", () =>
    fixture((path) => {
      let db = new DatabaseSync(path);
      db.exec(
        "CREATE TABLE thread(id TEXT); INSERT INTO thread VALUES('precious')",
      );
      db.close();
      expect(() => new DraftStorage(path)).toThrow();
      expect(readFileSync(`${path}.before-v1`).length).toBeGreaterThan(0);
      db = new DatabaseSync(path);
      expect(db.prepare("SELECT id FROM thread").get()?.id).toBe("precious");
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(0);
      expect(
        db
          .prepare("SELECT name FROM sqlite_master WHERE name='workspace'")
          .get(),
      ).toBeUndefined();
      db.exec("PRAGMA user_version=999");
      db.close();
      expect(() => new DraftStorage(path)).toThrow();
      db = new DatabaseSync(path);
      expect(db.prepare("PRAGMA user_version").get()?.user_version).toBe(999);
      db.close();
    }));
  it("locked writer reports failure without overwriting draft", () =>
    fixture(async (path) => {
      const store = new DraftStorage(path);
      const draft = store.create("/fixture");
      const locker = new DatabaseSync(path);
      locker.exec("BEGIN IMMEDIATE");
      const service = new DraftService(store, async () => null);
      const result = await service.execute({
        kind: "save",
        traceId: crypto.randomUUID(),
        threadId: draft.threadId,
        expectedRevision: 0,
        text: "unsaved",
      });
      expect(result.kind).toBe("failed");
      expect(store.read(draft.threadId).text).toBe("");
      locker.exec("ROLLBACK");
      locker.close();
      store.close();
    }));
});

it("overlapping project requests open one dialog and create one foreground identity", () =>
  fixture(async (path, dir) => {
    const store = new DraftStorage(path);
    let finish: ((path: string) => void) | undefined;
    const service = new DraftService(
      store,
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.execute({
      kind: "choose-project",
      traceId: crypto.randomUUID(),
    });
    expect(
      (
        await service.execute({
          kind: "choose-project",
          traceId: crypto.randomUUID(),
        })
      ).kind,
    ).toBe("failed");
    finish?.(dir);
    expect((await first).kind).toBe("ready");
    const active = store.active();
    expect(
      (
        await service.execute({
          kind: "choose-project",
          traceId: crypto.randomUUID(),
        })
      ).kind,
    ).toBe("failed");
    expect(store.active()?.threadId).toBe(active?.threadId);
    store.close();
  }));

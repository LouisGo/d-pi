import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AppStorage, StorageNotInitializedError } from "./wiring/app-storage";

function fixture(run: (path: string, dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-storage-init-"));
  try {
    run(join(dir, "app.sqlite"), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Opening and completing a database are two steps on purpose: recovery must run
// between them. That split is only safe if a caller who skips the second step
// fails at the seam instead of querying a half-migrated file.

it("refuses business access before the startup sequence completed", () => {
  fixture((path) => {
    const store = new AppStorage(path);
    try {
      expect(() => store.threads).toThrow(StorageNotInitializedError);
      expect(() => store.drafts).toThrow(StorageNotInitializedError);
      expect(() => store.submissions).toThrow(StorageNotInitializedError);
      expect(() => store.preferences).toThrow(StorageNotInitializedError);
    } finally {
      store.close();
    }
  });
});

it("serves repositories after initialize and tolerates a second call", () => {
  fixture((path, dir) => {
    const store = new AppStorage(path);
    try {
      store.initialize();
      store.initialize();
      const draft = store.drafts.create(dir);
      expect(store.drafts.read(draft.threadId).directory).toBe(dir);
      expect(store.preferences.read().locale).toBe("system");
    } finally {
      store.close();
    }
  });
});

it("keeps a failed initialization from publishing a usable store", () => {
  fixture((path) => {
    const store = new AppStorage(path);
    // A closed connection is the simplest true failure: initialize() must not
    // report success and must not leave repositories reachable.
    store.close();
    expect(() => store.initialize()).toThrow(/closed/);
    expect(() => store.threads).toThrow(StorageNotInitializedError);
    expect(() => store.initialize()).toThrow(/closed/);
  });
});

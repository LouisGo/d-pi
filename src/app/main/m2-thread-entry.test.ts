import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../shared/identity";
import { AppStorage } from "./wiring/app-storage";
import { DesktopCommandService } from "./wiring/desktop-command-service";

it("opens projects repeatedly, creates same-directory Threads, switches persisted drafts without changing bindings", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d-pi-m2-"));
  const store = AppStorage.open(join(dir, "app.sqlite"));
  const service = new DesktopCommandService(store, async () => dir);
  const traceId = crypto.randomUUID();
  try {
    const a = await service.execute({ kind: "choose-project", traceId });
    if (a.kind !== "ready" || !a.draft) throw Error("missing first draft");
    store.drafts.save(a.draft.threadId, 0, "first original\r\n");
    const b = await service.execute({ kind: "choose-project", traceId });
    expect(b.kind).toBe("ready");
    if (b.kind !== "ready" || !b.draft) return;
    expect(b.draft.threadId).not.toBe(a.draft.threadId);
    expect(b.draft.workingDirectoryId).toBe(a.draft.workingDirectoryId);
    const c = await service.execute({
      kind: "new-thread",
      threadId: b.draft.threadId,
      traceId,
    });
    expect(c.kind).toBe("ready");
    const restored = await service.execute({
      kind: "select-thread",
      threadId: a.draft.threadId,
      traceId,
    });
    expect(restored.kind === "ready" && restored.draft?.text).toBe(
      "first original\r\n",
    );
    const listing = await service.execute({ kind: "list-threads", traceId });
    expect(listing.kind === "threads" && listing.threads.length).toBe(3);
    const foreign = await service.execute({
      kind: "select-thread",
      threadId: ThreadIdSchema.parse(crypto.randomUUID()),
      traceId,
    });
    expect(foreign.kind).toBe("failed");
    expect(store.drafts.active()?.threadId).toBe(a.draft.threadId);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

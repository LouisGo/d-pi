import { afterEach, expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { DraftController } from "../../../modules/input/core/public";
import type { ToolDetailReply } from "../../../modules/resources/contracts/public";
import { WindowWorkbench } from "./window-workbench";

afterEach(() => vi.useRealTimers());
it("pins A across B, freezes the selected output revision, targets B explicitly, and closes only its read lease", async () => {
  const source = {
    kind: "live-tool" as const,
    threadId: crypto.randomUUID(),
    nativeSessionKey: "native",
    connectionGeneration: crypto.randomUUID(),
    toolCallId: "bash-1",
  };
  let receive: (event: ToolDetailReply) => void = () => {};
  const release = vi.fn(),
    insert = vi.fn(() => ({ kind: "inserted" as const }));
  const selected = vi.fn(async () => true);
  const work = new WindowWorkbench({
    conversation: {
      connect: () => () => {},
      watchTool: (_source, listener) => {
        receive = listener;
        return release;
      },
    },
    insert,
    select: selected,
  });
  const id = work.open({
    source,
    title: "bash",
    threadTitle: "A",
    rowId: "live-1",
  });
  if (!id) throw Error("missing surface");
  const detail = {
    source,
    contentRevision: "2",
    toolName: "bash",
    argumentsText: "{}",
    text: "first output",
    lifecycle: "running" as const,
    coverage: "observed" as const,
    truncated: false,
  };
  receive({ kind: "tool-detail", readerId: crypto.randomUUID(), detail });
  work.pin(id);
  work.selectRange(id, detail, 0, 5);
  receive({
    kind: "tool-detail",
    readerId: crypto.randomUUID(),
    detail: {
      ...detail,
      contentRevision: "3",
      text: "final output",
      lifecycle: "completed",
    },
  });
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/B",
    title: "B",
    revision: 4,
    text: "B body",
  });
  const b = new DraftController(
    draft,
    async () => {
      throw Error("unexpected save");
    },
    () => {
      throw Error("unexpected transport");
    },
  );
  expect(work.reference(id, { key: "B", controller: b, title: "B" })).toEqual({
    kind: "inserted",
  });
  expect(insert).toHaveBeenCalledWith(
    "B",
    b,
    expect.objectContaining({
      draftId: b.threadId,
      revision: 4,
      context: expect.objectContaining({
        text: "first",
        contentRevision: "2",
        range: { start: 0, end: 5 },
        source,
      }),
    }),
  );
  const locate = vi.fn(() => true);
  work.registerRows(
    source.threadId,
    "native",
    () => "materialized-original-row",
  );
  work.registerAnchor(source.threadId, locate);
  await work.returnToSource(id);
  expect(locate).toHaveBeenCalledWith("materialized-original-row");
  expect(work.stateStore.getState().surfaces[0]?.detail?.text).toBe(
    "final output",
  );
  work.close(id);
  expect(release).toHaveBeenCalledOnce();
  work.dispose();
  b.dispose();
});

it("closing or newer navigation invalidates an awaited return; late reads cannot recreate a surface", async () => {
  let resolve: (value: boolean) => void = () => {};
  let receive: (event: ToolDetailReply) => void = () => {};
  const work = new WindowWorkbench({
    conversation: {
      connect: () => () => {},
      watchTool: (_source, listener) => {
        receive = listener;
        return () => {};
      },
    },
    insert: () => ({ kind: "inserted" }),
    select: () =>
      new Promise((done) => {
        resolve = done;
      }),
  });
  const source = {
    kind: "live-tool" as const,
    threadId: crypto.randomUUID(),
    nativeSessionKey: "native",
    connectionGeneration: crypto.randomUUID(),
    toolCallId: "tool",
  };
  const id = work.open({
    source,
    title: "bash",
    threadTitle: "A",
    rowId: "row",
  });
  if (!id) throw Error("missing surface");
  const pending = work.returnToSource(id);
  work.close(id);
  resolve(true);
  await pending;
  receive({
    kind: "tool-unavailable",
    readerId: crypto.randomUUID(),
    reason: "missing",
  });
  const locate = vi.fn(() => true);
  work.registerRows(source.threadId, "native", () => "row");
  work.registerAnchor(source.threadId, locate);
  expect(locate).not.toHaveBeenCalled();
  expect(work.stateStore.getState()).toMatchObject({
    surfaces: [],
    returning: null,
  });
  work.dispose();
});

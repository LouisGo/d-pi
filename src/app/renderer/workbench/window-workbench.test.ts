import { afterEach, expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { DraftController } from "../../../modules/input/core/public";
import type { ToolDetailReply } from "../../../modules/resources/contracts/public";
import { WindowWorkbench } from "./window-workbench";

afterEach(() => vi.useRealTimers());
it("opens an artifact as a separate source, freezes its version and returns to the original tool member", async () => {
  const threadId = crypto.randomUUID();
  const source = {
    kind: "native-record" as const,
    threadId,
    nativeSessionKey: "native",
    recordId: "record",
    revision: "record-version",
  };
  const requestTool = vi.fn(async (command) => ({
    kind: "completed" as const,
    operationId: command.operationId,
    traceId: command.traceId,
    reply: {
      kind: "tool-detail" as const,
      readerId: command.readerId,
      detail: {
        source: command.artifactKey
          ? {
              kind: "native-artifact" as const,
              threadId,
              nativeSessionKey: "native",
              recordId: "record",
              recordRevision: "record-version",
              artifactKey: "0",
              revision: "a".repeat(64),
            }
          : source,
        contentRevision: command.artifactKey
          ? "a".repeat(64)
          : "record-version",
        nativeRecordId: "record",
        toolName: "bash",
        argumentsText: "{}",
        text: command.artifactKey ? "full artifact output" : "preview",
        lifecycle: "completed" as const,
        coverage: command.artifactKey
          ? ("observed" as const)
          : ("partial" as const),
        truncated: !command.artifactKey,
        artifact: {
          key: "0",
          coverage: "complete" as const,
          expectedBytes: 20,
        },
      },
    },
  }));
  const insert = vi.fn(() => ({ kind: "inserted" as const }));
  const work = new WindowWorkbench({
    history: {
      requestTool,
      cancelRead: async (identity) => ({ kind: "acknowledged", ...identity }),
      tool: vi.fn(),
      read: vi.fn(),
      projectList: vi.fn(),
      projectRead: vi.fn(),
    },
    insert,
    select: async () => true,
  });
  const first = work.open({
    source,
    title: "bash",
    threadTitle: "A",
    rowId: "record",
    cursor: { threadId, source: "record-version", offset: 1 },
  });
  if (!first) throw Error("missing preview");
  await vi.waitFor(() =>
    expect(work.stateStore.getState().surfaces[0]?.detail?.text).toBe(
      "preview",
    ),
  );
  work.pin(first);
  const full = work.openArtifact(first);
  if (!full) throw Error("missing artifact");
  await vi.waitFor(() =>
    expect(
      work.stateStore.getState().surfaces.find((s) => s.id === full)?.detail
        ?.text,
    ).toBe("full artifact output"),
  );
  const detail = work.stateStore
    .getState()
    .surfaces.find((s) => s.id === full)?.detail;
  if (!detail) throw Error("missing detail");
  work.selectRange(full, detail, 0, 4);
  const controller = new DraftController(
    DraftSchema.parse({
      schemaVersion: 1,
      threadId,
      workingDirectoryId: crypto.randomUUID(),
      directory: "/fixture",
      title: "B",
      revision: 1,
      text: "",
    }),
    async () => {
      throw Error("unexpected save");
    },
    () => {
      throw Error("unexpected transport");
    },
  );
  work.reference(full, { key: "destination", title: "B", controller });
  expect(insert.mock.calls[0]?.[2].context).toMatchObject({
    source: {
      kind: "native-artifact",
      artifactKey: "0",
      revision: "a".repeat(64),
    },
    text: "full",
  });
  const locate = vi.fn(() => true);
  work.registerRows(threadId, "native", () => "record");
  work.registerAnchor(threadId, locate);
  await work.returnToSource(full);
  expect(locate).toHaveBeenCalledWith("record");
  expect(
    work.stateStore.getState().surfaces.find((s) => s.id === first)?.detail
      ?.text,
  ).toBe("preview");
  work.dispose();
});
it("cancels the native detail read when the last surface closes without cancelling execution", async () => {
  const source = {
    kind: "native-record" as const,
    threadId: crypto.randomUUID(),
    nativeSessionKey: "native",
    revision: "frozen",
    recordId: "record",
  };
  const requestTool = vi.fn(() => new Promise<never>(() => {}));
  const cancelRead = vi.fn(async (identity) => ({
    kind: "acknowledged" as const,
    ...identity,
  }));
  const work = new WindowWorkbench({
    history: {
      requestTool,
      cancelRead,
      tool: vi.fn(),
      read: vi.fn(),
      projectList: vi.fn(),
      projectRead: vi.fn(),
    },
    insert: vi.fn(),
    select: async () => true,
  });
  const id = work.open({
    source,
    title: "bash",
    threadTitle: "A",
    rowId: "record",
    cursor: { threadId: source.threadId, source: "frozen", offset: 1 },
  });
  if (!id) throw Error("missing surface");
  await vi.waitFor(() => expect(requestTool).toHaveBeenCalledOnce());
  const request = requestTool.mock.calls[0]?.[0];
  work.close(id);
  expect(cancelRead).toHaveBeenCalledWith({
    operationId: request?.operationId,
    traceId: request?.traceId,
  });
  expect(work.stateStore.getState().surfaces).toHaveLength(0);
  work.dispose();
});
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

it("opening a new source invalidates an awaited return from a pinned source", async () => {
  let finish: (value: boolean) => void = () => {};
  const work = new WindowWorkbench({
    insert: () => ({ kind: "inserted" }),
    select: () =>
      new Promise((done) => {
        finish = done;
      }),
  });
  const target = {
    source: {
      kind: "live-tool" as const,
      threadId: crypto.randomUUID(),
      nativeSessionKey: "native",
      connectionGeneration: crypto.randomUUID(),
      toolCallId: "first",
    },
    title: "bash",
    threadTitle: "A",
    rowId: "row",
  };
  const id = work.open(target)!;
  work.pin(id);
  const pending = work.returnToSource(id);
  work.open({ ...target, source: { ...target.source, toolCallId: "second" } });
  expect(work.stateStore.getState().returning).toBeNull();
  finish(true);
  await pending;
  work.dispose();
});

it("hands a completed live record to trusted history and retains observed content on eviction or a failed handoff", async () => {
  let receive: (reply: ToolDetailReply) => void = () => {};
  const release = vi.fn();
  const tool = vi.fn(async (source, _cursor, readerId) => ({
    kind: "tool-detail" as const,
    readerId,
    detail: {
      source,
      contentRevision: "native-version",
      toolName: "bash",
      argumentsText: "{}",
      text: "persisted",
      lifecycle: "completed" as const,
      coverage: "observed" as const,
      truncated: false,
      nativeRecordId: "record",
    },
  }));
  const work = new WindowWorkbench({
    conversation: {
      connect: () => () => {},
      watchTool: (_source, listener) => {
        receive = listener;
        return release;
      },
    },
    history: {
      tool,
      read: async () => ({ kind: "unavailable", reason: "unbound" }),
      projectRead: async () => ({ kind: "unavailable", reason: "unbound" }),
      projectList: async () => ({ kind: "unavailable", reason: "missing" }),
    },
    insert: () => ({ kind: "inserted" }),
    select: async () => true,
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
  })!;
  work.pin(id);
  const detail = {
    source,
    contentRevision: "2",
    toolName: "bash",
    argumentsText: "{}",
    text: "observed",
    lifecycle: "completed" as const,
    coverage: "observed" as const,
    truncated: false,
    nativeRecordId: "record",
  };
  receive({ kind: "tool-detail", readerId: id, detail });
  await Promise.resolve();
  await Promise.resolve();
  expect(tool).toHaveBeenCalledWith(source, null, id, "record");
  expect(work.stateStore.getState().surfaces[0]?.detail?.text).toBe(
    "persisted",
  );
  expect(release).toHaveBeenCalledOnce();
  receive({ kind: "tool-unavailable", readerId: id, reason: "missing" });
  expect(work.stateStore.getState().surfaces[0]?.detail?.text).toBe(
    "persisted",
  );
  work.dispose();
});

it("loads missing source membership in a bounded return intent and never focuses after cancellation", async () => {
  const work = new WindowWorkbench({
    insert: () => ({ kind: "inserted" }),
    select: async () => true,
  });
  const source = {
    kind: "native-record" as const,
    threadId: crypto.randomUUID(),
    nativeSessionKey: "native",
    recordId: "record",
    revision: "snapshot",
  };
  const id = work.open({
    source,
    title: "bash",
    threadTitle: "A",
    rowId: "record",
  })!;
  const locate = vi.fn(() => true);
  let found = false;
  const load = vi.fn(async () => {
    found = true;
    work.registerRows(source.threadId, "native", () =>
      found ? "row" : undefined,
    );
    return true;
  });
  work.registerRows(source.threadId, "native", () => undefined, load);
  work.registerAnchor(source.threadId, locate);
  await work.returnToSource(id);
  await Promise.resolve();
  await Promise.resolve();
  expect(load).toHaveBeenCalledOnce();
  expect(locate).toHaveBeenCalledWith("row");
  found = false;
  let finish: (value: boolean) => void = () => {};
  work.registerRows(
    source.threadId,
    "native",
    () => undefined,
    () =>
      new Promise((done) => {
        finish = done;
      }),
  );
  await work.returnToSource(id);
  work.close(id);
  work.registerRows(source.threadId, "native", () => "late");
  finish(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(locate).toHaveBeenCalledTimes(1);
  work.dispose();
});

it("stops source membership loading after 16 pages", async () => {
  const work = new WindowWorkbench({
    insert: () => ({ kind: "inserted" }),
    select: async () => true,
  });
  const source = {
    kind: "native-record" as const,
    threadId: crypto.randomUUID(),
    nativeSessionKey: "native",
    recordId: "absent",
    revision: "snapshot",
  };
  const id = work.open({
    source,
    title: "bash",
    threadTitle: "A",
    rowId: "absent",
  })!;
  const load = vi.fn(async () => {
    work.registerRows(source.threadId, "native", () => undefined, load);
    return true;
  });
  work.registerRows(source.threadId, "native", () => undefined, load);
  work.registerAnchor(source.threadId, () => false);
  await work.returnToSource(id);
  for (let step = 0; step < 100; step++) await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(16);
  expect(work.stateStore.getState()).toMatchObject({
    returning: null,
    returnIssue: "limit",
  });
  work.dispose();
});

it("navigates a captured file source through the owning Thread and rejects a late navigation", async () => {
  const threadId = crypto.randomUUID();
  let finish: (value: boolean) => void = () => {};
  const select = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  const workbench = new WindowWorkbench({ select, insert: vi.fn() });
  const target = {
    kind: "file" as const,
    file: {
      kind: "current-workspace" as const,
      threadId,
      directory: "/project",
      path: "src/a.ts",
      reportedRange: { startLine: 7, endLine: 9 },
    },
  };
  const first = workbench.reveal(target);
  workbench.cancelReturn();
  finish(true);
  expect(await first).toBe(false);
  expect(workbench.stateStore.getState().workspaceNavigation).toBeNull();
  const second = workbench.reveal(target);
  finish(true);
  expect(await second).toBe(true);
  const intent = workbench.stateStore.getState().workspaceNavigation!;
  expect(intent.target).toEqual(target);
  expect(workbench.workspaceNavigationTicket(threadId)).toBe(intent.ticket);
  workbench.completeWorkspaceNavigation(intent.ticket);
  expect(workbench.stateStore.getState().workspaceNavigation).toBeNull();
  workbench.dispose();
});

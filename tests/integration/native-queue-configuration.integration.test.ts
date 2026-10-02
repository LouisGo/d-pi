import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import {
  type HostCommand,
  type HostMessage,
  HostTransportCommandSchema,
  QueueSnapshotSchema,
  RuntimeCommandSchema,
  type RuntimeView,
} from "../../src/modules/execution/contracts/public";
import type {
  NativeObservation,
  NativeSessionOptions,
} from "../../src/modules/execution/host/public";
import { createSessionHost } from "../../src/modules/execution/host/public";
import { RuntimeService } from "../../src/modules/execution/main/public";

const boundary = vi.hoisted(() => ({
  fork: vi.fn(),
  observe: (_event: NativeObservation) => {},
  operation: vi.fn<(command: string, payload: unknown) => Promise<unknown>>(),
  control: vi.fn<() => Promise<unknown>>(),
  subagentRead: vi.fn<() => Promise<unknown>>(),
  queue: null as unknown,
  subagents: { agents: [] } as unknown,
  requests: [] as string[],
  queued: 1,
}));
vi.mock("electron", () => ({ utilityProcess: { fork: boundary.fork } }));
vi.mock("../../src/platform/omp/resources/public", () => ({
  managedSdkRuntime: async () => ({
    binary: "/fixture/bun",
    entry: "/fixture/host.mjs",
  }),
}));
vi.mock("../../src/modules/execution/host/native/native-session", () => ({
  NativeSession: class {
    constructor(
      private options: NativeSessionOptions,
      observe: (event: NativeObservation) => void,
    ) {
      boundary.observe = observe;
    }
    async start() {}
    async close() {}
    write() {
      throw Error("No input submission belongs to this fixture");
    }
    async request(command: string, payload?: unknown) {
      boundary.requests.push(command);
      if (command === "d_pi_queue" || command === "d_pi_subagent_config")
        return boundary.operation(command, payload);
      if (command === "d_pi_subagent_state") return boundary.subagentRead();
      if (command === "d_pi_state") return boundary.control();
      return {
        success: true,
        data: {
          sessionId: "native",
          sessionFile: join(this.options.sessionDirectory, "session.jsonl"),
          model: { id: "parent", provider: "fixture" },
          isStreaming: false,
          isCompacting: false,
          queuedMessageCount: boundary.queued,
        },
      };
    }
  },
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  boundary.observe({ kind: "disconnected", reason: "exit" });
  for (const close of cleanup.splice(0)) close();
  boundary.operation.mockReset();
  boundary.control.mockReset();
  boundary.subagentRead.mockReset();
  boundary.requests.length = 0;
  vi.useRealTimers();
});

async function running(text = "original") {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-queue-config-")));
  const directory = join(root, "project");
  mkdirSync(directory);
  const store = AppStorage.open(join(root, "app.sqlite"));
  const draft = store.drafts.create(directory);
  const itemId = crypto.randomUUID();
  const initial = QueueSnapshotSchema.parse({
    revision: 1,
    items: [
      {
        id: itemId,
        kind: "followUp",
        text,
        editable: true,
        editing: false,
        truncated: false,
      },
    ],
    editing: null,
    hiddenCount: 0,
    coverage: "complete",
  });
  boundary.queue = initial;
  boundary.queued = 1;
  const control = () => ({
    paused: false,
    stopping: false,
    streaming: false,
    compacting: false,
    queued: boundary.queued,
    background: 0,
    pendingAsync: false,
    admitted: false,
    queue: boundary.queued
      ? [{ kind: "followUp", text: text.slice(0, 2048) }]
      : [],
    queueState: boundary.queue,
  });
  boundary.control.mockImplementation(async () => ({
    success: true,
    data: control(),
  }));
  boundary.subagents = {
    agents: [
      {
        name: "task",
        description: "Task",
        override: null,
        effectivePatterns: ["fixture/parent"],
      },
    ],
  };
  boundary.subagentRead.mockImplementation(async () => ({
    success: true,
    data: boundary.subagents,
  }));
  const process = new EventEmitter();
  let scopeId = "";
  const messages: HostMessage[] = [],
    commands: HostCommand[] = [],
    views: RuntimeView[] = [];
  const host = createSessionHost(
    (message) => {
      messages.push(message);
      process.emit("message", { scopeId, message });
    },
    () => process.emit("exit"),
  );
  const postMessage = (raw: unknown) => {
    const envelope = HostTransportCommandSchema.parse(raw);
    scopeId = envelope.scopeId;
    commands.push(envelope.command);
    void host.handle(envelope.command);
  };
  boundary.fork.mockReturnValue(Object.assign(process, { postMessage }));
  const runtime = new RuntimeService(store, root, root, {}, (view) =>
    views.push(view),
  );
  cleanup.push(() => {
    process.emit("exit");
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  await runtime.execute(
    RuntimeCommandSchema.parse({
      kind: "allow",
      threadId: draft.threadId,
      traceId: crypto.randomUUID(),
    }),
  );
  const started = await runtime.execute(
    RuntimeCommandSchema.parse({
      kind: "start",
      threadId: draft.threadId,
      traceId: crypto.randomUUID(),
    }),
  );
  if (!started.connectionGeneration)
    throw Error("Fixture missing connection generation");
  const generation = started.connectionGeneration;
  function command(
    kind: "manage-queue" | "configure-subagent",
    traceId = crypto.randomUUID(),
  ) {
    return RuntimeCommandSchema.parse(
      kind === "manage-queue"
        ? {
            kind,
            threadId: draft.threadId,
            traceId,
            connectionGeneration: generation,
            command: { action: "delete", entryId: itemId, revision: 1 },
          }
        : {
            kind,
            threadId: draft.threadId,
            traceId,
            connectionGeneration: generation,
            command: {
              kind: "set",
              agent: "task",
              provider: "fixture",
              modelId: "child",
              thinking: { kind: "default" },
            },
          },
    );
  }
  return {
    runtime,
    store,
    draft,
    itemId,
    initial,
    generation,
    host,
    messages,
    commands,
    views,
    process,
    control,
    command,
    scopeId: () => scopeId,
  };
}

it("acknowledges a native begin-edit without inventing a durable destructive-change record", async () => {
  const f = await running();
  const edited = {
    ...f.initial,
    revision: 2,
    items: f.initial.items.map((item) => ({ ...item, editing: true })),
    editing: { entryId: f.itemId, draftText: "original" },
  };
  boundary.operation.mockImplementation(async () => {
    boundary.queue = edited;
    return { success: true, data: edited };
  });
  const traceId = crypto.randomUUID();
  const view = await f.runtime.execute(
    RuntimeCommandSchema.parse({
      kind: "manage-queue",
      threadId: f.draft.threadId,
      traceId,
      connectionGeneration: f.generation,
      command: { action: "begin-edit", entryId: f.itemId, revision: 1 },
    }),
  );
  expect(view.queueOperation).toEqual({ traceId, status: "acknowledged" });
  expect(view.control?.queueState).toEqual(edited);
  expect(f.store.queueChanges.find(traceId)).toBeNull();
});
it("updates and saves the active edit when reserving its large draft truncates the original projection", async () => {
  const original = "a".repeat(250000);
  const f = await running(original);
  const edited = QueueSnapshotSchema.parse({
    ...f.initial,
    revision: 2,
    items: f.initial.items.map((item) => ({
      ...item,
      text: original.slice(0, 2048),
      editing: true,
      editable: false,
      truncated: true,
    })),
    editing: { entryId: f.itemId, draftText: original },
    coverage: "limited",
  });
  boundary.operation.mockImplementationOnce(async () => {
    boundary.queue = edited;
    return { success: true, data: edited };
  });
  const execute = (command: unknown) =>
    f.runtime.execute(
      RuntimeCommandSchema.parse({
        kind: "manage-queue",
        threadId: f.draft.threadId,
        traceId: crypto.randomUUID(),
        connectionGeneration: f.generation,
        command,
      }),
    );
  expect(f.initial.items[0]).toMatchObject({
    editable: true,
    truncated: false,
    text: original,
  });
  const begun = await execute({
    action: "begin-edit",
    entryId: f.itemId,
    revision: 1,
  });
  expect(begun.queueOperation?.status).toBe("acknowledged");
  expect(begun.control?.queueState).toEqual(edited);

  const draftText = `${original.slice(0, -1)}b`;
  const updated = {
    ...edited,
    revision: 3,
    editing: { entryId: f.itemId, draftText },
  };
  boundary.operation.mockImplementationOnce(async () => {
    boundary.queue = updated;
    return { success: true, data: updated };
  });
  const changed = await execute({
    action: "update-edit",
    entryId: f.itemId,
    revision: 2,
    text: draftText,
  });
  expect(changed.queueOperation?.status).toBe("acknowledged");
  expect(changed.control?.queueState?.editing?.draftText).toBe(draftText);

  const saved = {
    ...f.initial,
    revision: 4,
    items: f.initial.items.map((item) => ({
      ...item,
      text: "short replacement",
    })),
  };
  boundary.operation.mockImplementationOnce(async () => {
    boundary.queue = saved;
    return { success: true, data: saved };
  });
  const finished = await execute({
    action: "save-edit",
    entryId: f.itemId,
    revision: 3,
    text: "short replacement",
  });
  expect(finished.queueOperation).toMatchObject({ status: "acknowledged" });
  expect(finished.control?.queueState).toEqual(saved);
  expect(
    f.store.queueChanges.find(finished.queueOperation?.traceId ?? ""),
  ).toMatchObject({
    status: "acknowledged",
    previousText: original.slice(0, 2048),
    previousTruncated: true,
  });
  expect(boundary.operation).toHaveBeenCalledTimes(3);
  expect(boundary.operation).toHaveBeenNthCalledWith(2, "d_pi_queue", {
    command: {
      action: "update-edit",
      entryId: f.itemId,
      revision: 2,
      text: draftText,
    },
  });
  expect(boundary.operation).toHaveBeenNthCalledWith(3, "d_pi_queue", {
    command: {
      action: "save-edit",
      entryId: f.itemId,
      revision: 3,
      text: "short replacement",
    },
  });
});
it.each([
  { action: "update-edit", editing: "none" },
  { action: "save-edit", editing: "none" },
  { action: "update-edit", editing: "other" },
  { action: "save-edit", editing: "other" },
] as const)(
  "rejects $action when the current edit belongs to $editing before native dispatch or journaling",
  async ({ action, editing }) => {
    const f = await running();
    if (editing === "other") {
      const otherId = crypto.randomUUID();
      boundary.queue = {
        ...f.initial,
        items: [
          ...f.initial.items,
          { ...f.initial.items[0], id: otherId, editing: true },
        ],
        editing: { entryId: otherId, draftText: "other draft" },
      };
      boundary.observe({
        kind: "frame",
        frame: { type: "d_pi_control_state", data: f.control() },
      });
      await vi.waitFor(() =>
        expect(f.views.at(-1)?.control?.queueState?.editing?.entryId).toBe(
          otherId,
        ),
      );
    }
    const traceId = crypto.randomUUID();
    await expect(
      f.runtime.execute(
        RuntimeCommandSchema.parse({
          kind: "manage-queue",
          threadId: f.draft.threadId,
          traceId,
          connectionGeneration: f.generation,
          command: {
            action,
            entryId: f.itemId,
            revision: 1,
            text: "replacement",
          },
        }),
      ),
    ).rejects.toThrow("Queue entry is not being edited");
    expect(boundary.operation).not.toHaveBeenCalled();
    expect(f.store.queueChanges.find(traceId)).toBeNull();
  },
);
it.each([
  { editable: false, truncated: false },
  { editable: true, truncated: true },
])(
  "rejects begin-edit for a projected item with editable=$editable truncated=$truncated",
  async (qualification) => {
    const f = await running();
    boundary.queue = {
      ...f.initial,
      items: f.initial.items.map((item) => ({ ...item, ...qualification })),
    };
    boundary.observe({
      kind: "frame",
      frame: { type: "d_pi_control_state", data: f.control() },
    });
    await vi.waitFor(() =>
      expect(f.views.at(-1)?.control?.queueState?.items[0]).toMatchObject(
        qualification,
      ),
    );
    const traceId = crypto.randomUUID();
    await expect(
      f.runtime.execute(
        RuntimeCommandSchema.parse({
          kind: "manage-queue",
          threadId: f.draft.threadId,
          traceId,
          connectionGeneration: f.generation,
          command: { action: "begin-edit", entryId: f.itemId, revision: 1 },
        }),
      ),
    ).rejects.toThrow("Unsupported queue content");
    expect(boundary.operation).not.toHaveBeenCalled();
    expect(f.store.queueChanges.find(traceId)).toBeNull();
  },
);
it("persists queue intent before native mutation and publishes the native snapshot before acknowledging it", async () => {
  const f = await running();
  const command = f.command("manage-queue");
  const updated = { ...f.initial, revision: 2, items: [] };
  boundary.operation.mockImplementation(async () => {
    expect(f.store.queueChanges.find(command.traceId)).toMatchObject({
      status: "dispatching",
      previousText: "original",
      target: { connectionGeneration: f.generation },
    });
    boundary.queue = updated;
    return { success: true, data: updated };
  });
  const view = await f.runtime.execute(command);
  expect(view.queueOperation).toEqual({
    traceId: command.traceId,
    status: "acknowledged",
  });
  expect(f.store.queueChanges.find(command.traceId)).toMatchObject({
    status: "acknowledged",
    previousText: "original",
  });
  const acknowledgement = f.messages.findIndex(
    (message) =>
      message.kind === "operation-result" &&
      message.traceId === command.traceId,
  );
  const projection = f.messages.findIndex(
    (message) =>
      message.kind === "control" && message.state.queueState?.revision === 2,
  );
  expect(projection).toBeGreaterThanOrEqual(0);
  expect(acknowledgement).toBeGreaterThan(projection);
  expect(view.control?.queueState).toEqual(updated);
  expect(boundary.operation).toHaveBeenCalledExactlyOnceWith("d_pi_queue", {
    command: { action: "delete", entryId: f.itemId, revision: 1 },
  });
});
it("publishes confirmed future-subagent defaults before ACK while leaving the parent's model intact", async () => {
  const f = await running();
  const command = f.command("configure-subagent");
  const updated = {
    agents: [
      {
        name: "task",
        description: "Task",
        override: {
          provider: "fixture",
          modelId: "child",
          thinking: { kind: "default" },
        },
        effectivePatterns: ["fixture/child"],
      },
    ],
  };
  boundary.operation.mockImplementation(async () => {
    boundary.subagents = updated;
    return { success: true, data: updated };
  });
  const view = await f.runtime.execute(command);
  expect(view.subagentOperation).toEqual({
    traceId: command.traceId,
    status: "acknowledged",
  });
  expect(view.model).toBe("fixture/parent");
  expect(view.subagents).toEqual(updated);
  const projection = f.messages.findIndex(
    (message) =>
      message.kind === "subagents" &&
      message.state.agents[0]?.override?.modelId === "child",
  );
  const acknowledgement = f.messages.findIndex(
    (message) =>
      message.kind === "operation-result" &&
      message.traceId === command.traceId,
  );
  expect(projection).toBeGreaterThanOrEqual(0);
  expect(acknowledgement).toBeGreaterThan(projection);
  expect(boundary.operation).toHaveBeenCalledTimes(1);
});
it.each(["manage-queue", "configure-subagent"] as const)(
  "retains native failure code for %s",
  async (kind) => {
    const f = await running(),
      command = f.command(kind);
    const code =
      kind === "manage-queue" ? "stale-queue-revision" : "model-unavailable";
    boundary.operation.mockResolvedValue({ success: false, error: code });
    const view = await f.runtime.execute(command);
    const operation =
      kind === "manage-queue" ? view.queueOperation : view.subagentOperation;
    expect(operation).toEqual({
      traceId: command.traceId,
      status: "failed",
      code,
    });
    if (kind === "manage-queue")
      expect(f.store.queueChanges.find(command.traceId)).toMatchObject({
        status: "failed",
        previousText: "original",
      });
    expect(boundary.operation).toHaveBeenCalledTimes(1);
  },
);
it.each(["manage-queue", "configure-subagent"] as const)(
  "does not convert malformed native success for %s into acknowledged state",
  async (kind) => {
    const f = await running(),
      command = f.command(kind);
    boundary.operation.mockResolvedValue({ success: true, data: {} });
    const view = await f.runtime.execute(command);
    expect(
      kind === "manage-queue"
        ? view.queueOperation?.status
        : view.subagentOperation?.status,
    ).toBe("unknown");
    expect(
      f.messages.some(
        (message) =>
          message.kind === "operation-result" &&
          message.traceId === command.traceId &&
          message.status === "acknowledged",
      ),
    ).toBe(false);
    if (kind === "manage-queue")
      expect(f.store.queueChanges.find(command.traceId)?.status).toBe(
        "unknown",
      );
    expect(boundary.operation).toHaveBeenCalledTimes(1);
  },
);
it.each(["manage-queue", "configure-subagent"] as const)(
  "keeps %s unknown after transport rejection and never retries the native mutation",
  async (kind) => {
    const f = await running(),
      command = f.command(kind);
    boundary.operation.mockRejectedValue(Error("Native timeout"));
    const view = await f.runtime.execute(command);
    expect(
      kind === "manage-queue"
        ? view.queueOperation?.status
        : view.subagentOperation?.status,
    ).toBe("unknown");
    expect(boundary.operation).toHaveBeenCalledTimes(1);
  },
);
it("releases an in-flight queue mutation as unknown on disconnection without dispatching it again", async () => {
  const f = await running(),
    command = f.command("manage-queue");
  let resolve = (value: unknown) => {
    throw Error(String(value));
  };
  boundary.operation.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const changing = f.runtime.execute(command);
  await vi.waitFor(() => expect(boundary.operation).toHaveBeenCalledTimes(1));
  boundary.observe({ kind: "disconnected", reason: "exit" });
  const view = await changing;
  expect(view.phase).toBe("interrupted");
  expect(view.queueOperation?.status).toBe("unknown");
  expect(f.store.queueChanges.find(command.traceId)?.status).toBe("unknown");
  resolve({ success: true, data: { ...f.initial, revision: 2, items: [] } });
  await Promise.resolve();
  expect(boundary.operation).toHaveBeenCalledTimes(1);
  expect(
    f.messages.some(
      (message) =>
        message.kind === "operation-result" &&
        message.traceId === command.traceId &&
        message.status === "acknowledged",
    ),
  ).toBe(false);
});
it("rejects malformed and stale commands before reaching the native write boundary", async () => {
  const f = await running(),
    command = f.command("manage-queue");
  expect(
    RuntimeCommandSchema.safeParse({
      ...command,
      connectionGeneration: undefined,
    }).success,
  ).toBe(false);
  expect(
    HostTransportCommandSchema.safeParse({
      scopeId: f.scopeId(),
      command: {
        kind: "manage-queue",
        command: {
          ...command,
          command: { action: "save-edit", entryId: f.itemId, revision: 1 },
        },
      },
    }).success,
  ).toBe(false);
  await expect(
    f.runtime.execute({
      ...command,
      connectionGeneration: crypto.randomUUID(),
    }),
  ).rejects.toThrow("Stale operation target");
  if (command.kind !== "manage-queue") throw Error("Expected queue command");
  await expect(
    f.runtime.execute({
      ...command,
      command: { ...command.command, revision: 0 },
    }),
  ).rejects.toThrow("Stale queue snapshot");
  expect(boundary.operation).not.toHaveBeenCalled();
  expect(f.store.queueChanges.find(command.traceId)).toBeNull();
});
it("does not let wrong-generation, wrong-operation or malformed ACKs settle a matching trace", async () => {
  const f = await running(),
    command = f.command("manage-queue");
  let release = (_value: unknown) => {};
  boundary.operation.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  let settled = false;
  const changing = f.runtime.execute(command).then((view) => {
    settled = true;
    return view;
  });
  await vi.waitFor(() => expect(boundary.operation).toHaveBeenCalledTimes(1));
  const emit = (message: unknown) =>
    f.process.emit("message", { scopeId: f.scopeId(), message });
  emit({
    kind: "operation-result",
    traceId: command.traceId,
    connectionGeneration: crypto.randomUUID(),
    operation: "manage-queue",
    status: "acknowledged",
  });
  emit({
    kind: "operation-result",
    traceId: command.traceId,
    connectionGeneration: f.generation,
    operation: "configure-subagent",
    status: "acknowledged",
  });
  emit({
    kind: "operation-result",
    traceId: command.traceId,
    connectionGeneration: f.generation,
    operation: "manage-queue",
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(settled).toBe(false);
  expect(f.store.queueChanges.find(command.traceId)?.status).toBe(
    "dispatching",
  );
  boundary.queue = { ...f.initial, revision: 2, items: [] };
  release({ success: true, data: boundary.queue });
  expect((await changing).queueOperation?.status).toBe("acknowledged");
  expect(boundary.operation).toHaveBeenCalledTimes(1);
});
it("times out an unanswered mutation as unknown without resending it", async () => {
  const f = await running(),
    command = f.command("manage-queue");
  vi.useFakeTimers();
  let release = (_value: unknown) => {};
  boundary.operation.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const changing = f.runtime.execute(command);
  await vi.waitFor(() => expect(boundary.operation).toHaveBeenCalledTimes(1));
  await vi.advanceTimersByTimeAsync(12001);
  const view = await changing;
  expect(view.queueOperation?.status).toBe("unknown");
  expect(f.store.queueChanges.find(command.traceId)?.status).toBe("unknown");
  expect(boundary.operation).toHaveBeenCalledTimes(1);
  release({ success: false, error: "fixture-unavailable" });
  await Promise.resolve();
});
it("waits for a fresh native inspection before reconciling unknown operations and retains their durable unknown receipt", async () => {
  const f = await running(),
    command = f.command("manage-queue");
  boundary.operation.mockResolvedValue({ success: true, data: {} });
  await f.runtime.execute(command);
  const before = boundary.control.mock.calls.length;
  let release = (_value: unknown) => {};
  boundary.control.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  let settled = false;
  const inspectTrace = crypto.randomUUID();
  const inspecting = f.runtime
    .execute(
      RuntimeCommandSchema.parse({
        kind: "inspect",
        threadId: f.draft.threadId,
        traceId: inspectTrace,
      }),
    )
    .then((view) => {
      settled = true;
      return view;
    });
  await vi.waitFor(() =>
    expect(boundary.control.mock.calls.length).toBeGreaterThan(before),
  );
  expect(settled).toBe(false);
  const updated = { ...f.initial, revision: 2, items: [] };
  boundary.queue = updated;
  release({ success: true, data: f.control() });
  const view = await inspecting;
  expect(view.control?.queueState).toEqual(updated);
  expect(view.queueOperation).toMatchObject({
    traceId: command.traceId,
    status: "unknown",
    reconciled: true,
  });
  expect(f.store.queueChanges.find(command.traceId)?.status).toBe("unknown");
  expect(boundary.operation).toHaveBeenCalledTimes(1);
  const acknowledged = f.messages.findIndex(
    (message) =>
      message.kind === "operation-result" &&
      message.operation === "inspect" &&
      message.traceId === inspectTrace &&
      message.status === "acknowledged",
  );
  const published = f.messages.findIndex(
    (message) =>
      message.kind === "control" && message.state.queueState?.revision === 2,
  );
  expect(published).toBeGreaterThanOrEqual(0);
  expect(acknowledged).toBeGreaterThan(published);
});
it("keeps unknown mutation unreconciled when the fresh native state cannot be read", async () => {
  const f = await running(),
    command = f.command("manage-queue");
  boundary.operation.mockResolvedValue({ success: true, data: {} });
  await f.runtime.execute(command);
  boundary.control.mockResolvedValueOnce({
    success: false,
    error: "fixture-unavailable",
  });
  const view = await f.runtime.execute(
    RuntimeCommandSchema.parse({
      kind: "inspect",
      threadId: f.draft.threadId,
      traceId: crypto.randomUUID(),
    }),
  );
  expect(view.queueOperation?.status).toBe("unknown");
  expect(view.queueOperation?.reconciled).not.toBe(true);
  expect(f.store.queueChanges.find(command.traceId)?.status).toBe("unknown");
  expect(boundary.operation).toHaveBeenCalledTimes(1);
});
it("does not reconcile unknown subagent configuration from a control-only refresh when subagent readback fails", async () => {
  const f = await running(),
    command = f.command("configure-subagent");
  boundary.operation.mockResolvedValue({ success: true, data: {} });
  await f.runtime.execute(command);
  boundary.subagentRead.mockResolvedValueOnce({
    success: false,
    error: "subagent-unavailable",
  });
  const view = await f.runtime.execute(
    RuntimeCommandSchema.parse({
      kind: "inspect",
      threadId: f.draft.threadId,
      traceId: crypto.randomUUID(),
    }),
  );
  expect(view.subagentOperation?.status).toBe("unknown");
  expect(view.subagentOperation?.reconciled).not.toBe(true);
  expect(boundary.operation).toHaveBeenCalledTimes(1);
});
it.each(["manage-queue", "configure-subagent"] as const)(
  "blocks another %s write until the unknown operation has a fresh native readback",
  async (kind) => {
    const f = await running(),
      command = f.command(kind);
    boundary.operation.mockResolvedValue({ success: true, data: {} });
    await f.runtime.execute(command);
    await expect(f.runtime.execute(f.command(kind))).rejects.toThrow(
      "Unknown operation requires fresh state",
    );
    expect(boundary.operation).toHaveBeenCalledTimes(1);
    await f.runtime.execute(
      RuntimeCommandSchema.parse({
        kind: "inspect",
        threadId: f.draft.threadId,
        traceId: crypto.randomUUID(),
      }),
    );
    boundary.operation.mockImplementation(async (nativeCommand) => ({
      success: true,
      data:
        nativeCommand === "d_pi_queue" ? boundary.queue : boundary.subagents,
    }));
    const next = await f.runtime.execute(f.command(kind));
    expect(
      kind === "manage-queue"
        ? next.queueOperation?.status
        : next.subagentOperation?.status,
    ).toBe("acknowledged");
    expect(boundary.operation).toHaveBeenCalledTimes(2);
  },
);
it.each(["manage-queue", "configure-subagent"] as const)(
  "keeps a pending %s control active after native execution itself becomes idle",
  async (kind) => {
    const f = await running(),
      command = f.command(kind);
    let release = (_value: unknown) => {};
    boundary.operation.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const changing = f.runtime.execute(command);
    await vi.waitFor(() => expect(boundary.operation).toHaveBeenCalledTimes(1));
    boundary.queued = 0;
    boundary.queue = { ...f.initial, revision: 2, items: [] };
    boundary.observe({
      kind: "frame",
      frame: { type: "d_pi_control_state", data: f.control() },
    });
    await vi.waitFor(() => expect(f.views.at(-1)?.busy).toBe(false));
    try {
      expect(f.runtime.hasActiveWork()).toBe(true);
      await expect(f.runtime.closeIdle()).rejects.toThrow("Active native work");
    } finally {
      release({
        success: true,
        data: kind === "manage-queue" ? boundary.queue : boundary.subagents,
      });
      await changing;
    }
    expect(f.runtime.hasActiveWork()).toBe(false);
  },
);
it.each(["manage-queue", "configure-subagent"] as const)(
  "rechecks pending %s after async directory validation before dispatching concurrent traces",
  async (kind) => {
    const f = await running();
    const releases: ((value: unknown) => void)[] = [];
    boundary.operation.mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(resolve);
        }),
    );
    let rejected = 0;
    const results = Promise.allSettled(
      [f.command(kind), f.command(kind)].map((command) =>
        f.runtime.execute(command).catch((error) => {
          rejected++;
          throw error;
        }),
      ),
    );
    await vi.waitFor(() =>
      expect(boundary.operation.mock.calls.length > 1 || rejected > 0).toBe(
        true,
      ),
    );
    try {
      expect(boundary.operation).toHaveBeenCalledTimes(1);
    } finally {
      for (const release of releases)
        release({
          success: true,
          data: kind === "manage-queue" ? boundary.queue : boundary.subagents,
        });
      await results;
    }
    expect(
      (await results).filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
  },
);
it("does not replace another pending queue trace when an acknowledged trace is repeated", async () => {
  const f = await running();
  const previous = f.command("manage-queue");
  boundary.operation.mockResolvedValue({ success: true, data: boundary.queue });
  await f.runtime.execute(previous);
  let release = (_value: unknown) => {};
  boundary.operation.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const current = f.command("manage-queue");
  const changing = f.runtime.execute(current);
  await vi.waitFor(() => expect(boundary.operation).toHaveBeenCalledTimes(2));
  try {
    const repeated = await f.runtime.execute(previous);
    expect(repeated.queueOperation).toEqual({
      traceId: current.traceId,
      status: "pending",
    });
    await expect(f.runtime.execute(f.command("manage-queue"))).rejects.toThrow(
      "Stale operation target",
    );
    expect(boundary.operation).toHaveBeenCalledTimes(2);
    expect(f.store.queueChanges.find(previous.traceId)?.status).toBe(
      "acknowledged",
    );
  } finally {
    release({ success: true, data: boundary.queue });
    await changing;
  }
});

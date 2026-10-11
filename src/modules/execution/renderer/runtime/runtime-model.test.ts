import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../../../shared/identity";
import type { RuntimeReply, RuntimeView } from "../../contracts/public";
import { RuntimeModel } from "./runtime-model";

it("late inspect results cannot replace a newer native state; releasing the view does not stop runtime", async () => {
  const thread = ThreadIdSchema.parse(crypto.randomUUID());
  let deliver: (value: RuntimeView) => void = () => {};
  let finish: (value: RuntimeReply) => void = () => {};
  let removed = false;
  const model = new RuntimeModel({
    request: () =>
      new Promise((accept) => {
        finish = accept;
      }),
    subscribe: (listener) => {
      deliver = listener;
      return () => {
        removed = true;
      };
    },
  });
  model.bind(thread);
  const ready: RuntimeView = {
    threadId: thread,
    traceId: crypto.randomUUID(),
    configuration: { code: "runtime.configDefault" },
    revision: 2,
    phase: "ready" as const,
    trusted: true,
    busy: false,
    model: "fixture",
    message: { code: "runtime.readyToSend" },
  };
  deliver(ready);
  finish({ kind: "view", view: { ...ready, phase: "allowed", revision: 1 } });
  await Promise.resolve();
  expect(model.getSnapshot()?.phase).toBe("ready");
  model.dispose();
  expect(removed).toBe(true);
});

it("keeps a failed request as a semantic status for display in the current locale", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async () => {
      throw Error("IPC unavailable");
    },
  });
  model.bind(threadId);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(model.getSnapshot()?.message).toEqual({
    code: "runtime.connectionUnknown",
  });
  model.dispose();
});

it("preserves a typed runtime failure message instead of collapsing it to transport unknown", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async (command): Promise<RuntimeReply> => ({
      kind: "failed",
      error: {
        traceId: command.traceId,
        code: "resource-missing",
        category: "resource",
        message: { code: "runtime.sdkResourcesUnavailable" },
      },
    }),
  });
  model.bind(threadId);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(model.getSnapshot()?.message).toEqual({
    code: "runtime.sdkResourcesUnavailable",
  });
  model.dispose();
});

it("a superseded control reply cannot resurrect a view the newer reply replaced", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const base: RuntimeView = {
    threadId,
    traceId: crypto.randomUUID(),
    configuration: { code: "runtime.configDefault" },
    connectionGeneration: crypto.randomUUID(),
    control: {
      streaming: false,
      compacting: false,
      stopping: false,
      queued: 0,
      background: 0,
      pendingAsync: false,
      admitted: false,
      paused: false,
      queue: [],
    },
    revision: 1,
    phase: "ready",
    trusted: true,
    busy: false,
    model: "fixture",
    message: { code: "runtime.readyToSend" },
  };
  // Each reply stays in flight until the test releases it, so an older request
  // can be answered *after* a newer one has already published.
  const inFlight: Array<() => void> = [];
  let revision = 0;
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: (): Promise<RuntimeReply> =>
      new Promise((accept) => {
        inFlight.push(() =>
          accept({ kind: "view", view: { ...base, revision: ++revision } }),
        );
      }),
  });
  model.bind(threadId);
  inFlight.shift()?.();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const stale = model.control("stop");
  const current = model.control("stop");
  // The newest request is the last one queued; release it first.
  const releaseCurrent = inFlight.pop();
  const releaseStale = inFlight.shift();
  releaseCurrent?.();
  await current;
  const published = model.getSnapshot()?.revision;
  releaseStale?.();
  await stale;
  expect(published).toBe(2);
  expect(model.getSnapshot()?.revision).toBe(published);
  model.dispose();
});

it("starts after an explicit project grant without a second startup action", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const requests: string[] = [];
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async (command) => {
      requests.push(command.kind);
      return {
        kind: "view",
        view: {
          threadId,
          traceId: command.traceId,
          configuration: { code: "runtime.configDefault" },
          revision: requests.length,
          phase:
            command.kind === "inspect"
              ? "browse"
              : command.kind === "allow"
                ? "allowed"
                : "ready",
          trusted: command.kind !== "inspect",
          busy: false,
          model: command.kind === "start" ? "fixture/model" : null,
          message: { code: "runtime.readyToSend" },
        },
      };
    },
  });
  try {
    await model.bind(threadId);
    await model.act("allow");
    expect(requests).toEqual(["inspect", "allow", "start"]);
    expect(model.getSnapshot()?.phase).toBe("ready");
  } finally {
    model.dispose();
  }
});

it.each(["revoke", "inspect"] as const)(
  "a newer %s supersedes a pending grant and cannot be followed by a late automatic startup",
  async (newer) => {
    const threadId = ThreadIdSchema.parse(crypto.randomUUID());
    const requests: string[] = [];
    let resolveGrant: (reply: RuntimeReply) => void = () => {};
    const view = (
      phase: RuntimeView["phase"],
      revision: number,
    ): RuntimeView => ({
      threadId,
      traceId: crypto.randomUUID(),
      configuration: { code: "runtime.configDefault" },
      revision,
      phase,
      trusted: phase === "allowed",
      busy: false,
      model: null,
      message: { code: "runtime.readyToSend" },
    });
    const model = new RuntimeModel({
      subscribe: () => () => {},
      request: async (command) => {
        requests.push(command.kind);
        if (command.kind === "allow")
          return new Promise((resolve) => {
            resolveGrant = resolve;
          });
        return { kind: "view", view: view("browse", requests.length) };
      },
    });
    try {
      await model.bind(threadId);
      const pending = model.act("allow");
      await model.act(newer);
      resolveGrant({ kind: "view", view: view("allowed", 10) });
      await pending;
      expect(requests).toEqual(["inspect", "allow", newer]);
      expect(model.getSnapshot()?.phase).toBe("browse");
    } finally {
      model.dispose();
    }
  },
);

it("preserves a grant but does not launch when the Thread leaves the active selection before the grant reply", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const requests: string[] = [];
  let resolveGrant: (reply: RuntimeReply) => void = () => {};
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async (command) => {
      requests.push(command.kind);
      if (command.kind === "allow")
        return new Promise((resolve) => {
          resolveGrant = resolve;
        });
      return {
        kind: "view",
        view: {
          threadId,
          traceId: command.traceId,
          configuration: { code: "runtime.configDefault" },
          revision: 0,
          phase: "browse",
          trusted: false,
          busy: false,
          model: null,
          message: { code: "runtime.readyToSend" },
        },
      };
    },
  });
  try {
    await model.bind(threadId);
    const pending = model.act("allow");
    model.setPreparationActive(false);
    resolveGrant({
      kind: "view",
      view: {
        threadId,
        traceId: crypto.randomUUID(),
        configuration: { code: "runtime.configDefault" },
        revision: 1,
        phase: "allowed",
        trusted: true,
        busy: false,
        model: null,
        message: { code: "runtime.readyToSend" },
      },
    });
    await pending;
    expect(requests).toEqual(["inspect", "allow"]);
    expect(model.getSnapshot()?.phase).toBe("allowed");
  } finally {
    model.dispose();
  }
});

it("keeps independent answers, admission locks and failed A beside written B", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const connectionGeneration = crypto.randomUUID();
  let deliver: (view: RuntimeView) => void = () => {};
  const replies = new Map<string, (reply: RuntimeReply) => void>();
  const calls: string[] = [];
  const model = new RuntimeModel({
    subscribe: (listener) => {
      deliver = listener;
      return () => {};
    },
    request: async (command) => {
      if (command.kind !== "answer") return { kind: "view", view: base };
      calls.push(command.id);
      return new Promise((resolve) => replies.set(command.id, resolve));
    },
  });
  const base: RuntimeView = {
    threadId,
    connectionGeneration,
    traceId: crypto.randomUUID(),
    configuration: { code: "runtime.configDefault" },
    revision: 1,
    phase: "ready",
    trusted: true,
    busy: false,
    model: "fixture",
    message: { code: "runtime.readyToSend" },
    interactions: {
      connectionGeneration,
      unsupported: false,
      items: ["A", "B"].map((id) => ({
        id,
        title: id,
        method: "input",
        status: "pending",
        expiresAt: null,
      })),
    },
  };
  await model.bind(threadId);
  deliver(base);
  const a = model.answer("A", { kind: "value", value: "first" });
  const duplicate = model.answer("A", { kind: "value", value: "duplicate" });
  const b = model.answer("B", { kind: "value", value: "second" });
  expect(calls).toEqual(["A", "B"]);
  const operationA = model.interactionOperation("A")!;
  const operationB = model.interactionOperation("B")!;
  replies.get("B")!({
    kind: "view",
    view: {
      ...base,
      revision: 3,
      interactionOperations: [{ ...operationB, status: "written" }],
    },
  });
  await b;
  replies.get("A")!({
    kind: "failed",
    error: {
      traceId: operationA.operationId,
      code: "denied",
      category: "resource",
      message: { code: "runtime.controlFailed" },
    },
  });
  await Promise.all([a, duplicate]);
  expect(model.interactionOperation("A")?.status).toBe("not-dispatched");
  expect(model.interactionOperation("B")?.status).toBe("written");
  expect(model.getSnapshot()?.revision).toBe(3);
  expect(model.interactionDraft("A")?.answer).toEqual({
    kind: "value",
    value: "first",
  });
  deliver({
    ...base,
    revision: 4,
    connectionGeneration: crypto.randomUUID(),
    interactions: {
      ...base.interactions!,
      connectionGeneration: crypto.randomUUID(),
    },
  });
  expect(model.interactionOperation("A")).toBeNull();
  model.dispose();
});

it("keeps an unknown answer locked while stop and another answer remain available", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const generation = crypto.randomUUID();
  const calls: string[] = [];
  const view: RuntimeView = {
    threadId,
    connectionGeneration: generation,
    traceId: crypto.randomUUID(),
    configuration: { code: "runtime.configDefault" },
    revision: 1,
    phase: "ready",
    trusted: true,
    busy: true,
    model: "fixture",
    message: { code: "runtime.readyToSend" },
    interactions: {
      connectionGeneration: generation,
      unsupported: false,
      items: ["A", "B"].map((id) => ({
        id,
        method: "input",
        title: id,
        status: "pending",
        expiresAt: null,
      })),
    },
  };
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async (command) => {
      calls.push(command.kind === "answer" ? command.id : command.kind);
      if (command.kind === "answer") throw Error("transport lost");
      return { kind: "view", view };
    },
  });
  await model.bind(threadId);
  model.editInteraction("A", { value: "draft", selection: { kind: "custom" } });
  await model.answer("A", { kind: "value", value: "draft" });
  await model.control("stop");
  await model.answer("B", { kind: "value", value: "other" });
  await model.answer("A", { kind: "value", value: "duplicate" });
  expect(calls).toEqual(["inspect", "A", "stop", "B"]);
  expect(model.interactionOperation("A")?.status).toBe("unknown");
  expect(model.interactionDraft("A")?.value).toBe("draft");
  model.dispose();
});

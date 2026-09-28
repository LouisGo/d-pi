import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../shared/identity";
import type { RuntimeView } from "./contracts";
import { RuntimeModel } from "./model";

it("late inspect results cannot replace a newer native state; releasing the view does not stop runtime", async () => {
  const thread = ThreadIdSchema.parse(crypto.randomUUID());
  let deliver: (value: RuntimeView) => void = () => {};
  let finish: (value: RuntimeView) => void = () => {};
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
  const ready = {
    threadId: thread,
    traceId: crypto.randomUUID(),
    configuration: "fixture",
    revision: 2,
    phase: "ready" as const,
    trusted: true,
    busy: false,
    model: "fixture",
    message: "ready",
  };
  deliver(ready);
  finish({ ...ready, phase: "allowed", revision: 1 });
  await Promise.resolve();
  expect(model.getSnapshot()?.phase).toBe("ready");
  model.dispose();
  expect(removed).toBe(true);
});

it("a reopened window reads the retained projection while execution is interrupted", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const generation = crypto.randomUUID();
  let attachments = 0;
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async () => ({
      threadId,
      traceId: crypto.randomUUID(),
      configuration: "fixture",
      revision: 3,
      phase: "interrupted",
      trusted: true,
      busy: true,
      model: "fixture",
      message: "Native disconnected",
    }),
    conversation: {
      connect: (_thread, listener) => {
        attachments++;
        listener({
          kind: "snapshot",
          generation,
          seq: 1,
          gap: false,
          items: [
            {
              id: 1,
              role: "assistant",
              label: "OMP",
              text: "Retained output",
              state: "streaming",
            },
          ],
        });
        return () => {};
      },
    },
  });
  try {
    model.bind(threadId);
    await Promise.resolve();
    expect(model.reading?.getSnapshot()?.items[0]?.text).toBe(
      "Retained output",
    );
    expect(model.getSnapshot()?.phase).toBe("interrupted");
    await model.act("inspect");
    expect(attachments).toBe(1);
  } finally {
    model.dispose();
  }
});

it("retries reading once when the initial browse subscription preceded Host startup", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  let receive: (view: RuntimeView) => void = () => {};
  let attachments = 0;
  const browse: RuntimeView = {
    threadId,
    traceId: crypto.randomUUID(),
    configuration: "fixture",
    revision: 0,
    phase: "browse",
    trusted: false,
    busy: false,
    model: null,
    message: "browse",
  };
  const model = new RuntimeModel({
    subscribe: (listener) => {
      receive = listener;
      return () => {};
    },
    request: async () => browse,
    conversation: {
      connect: () => {
        attachments++;
        return () => {};
      },
    },
  });
  try {
    model.bind(threadId);
    await Promise.resolve();
    expect(attachments).toBe(1);
    receive({ ...browse, revision: 1, phase: "ready", trusted: true });
    receive({
      ...browse,
      revision: 2,
      phase: "ready",
      trusted: true,
      busy: true,
    });
    expect(attachments).toBe(2);
  } finally {
    model.dispose();
  }
});

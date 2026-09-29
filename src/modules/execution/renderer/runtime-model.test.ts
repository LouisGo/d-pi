import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import type { RuntimeView } from "../contracts/public";
import { RuntimeModel } from "./runtime-model";

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
  finish({ ...ready, phase: "allowed", revision: 1 });
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

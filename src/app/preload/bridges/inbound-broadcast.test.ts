import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createInboundBroadcast } from "./inbound-broadcast";

it("validates once per inbound event and routes only to matching consumers with independent releases", () => {
  let receive: (_event: unknown, raw: unknown) => void = () => {};
  const ipc = {
    on: vi.fn((_channel, handler) => {
      receive = handler;
    }),
    removeListener: vi.fn(),
  };
  const schema = z.strictObject({ threadId: z.string(), value: z.number() });
  const parse = vi.spyOn(schema, "safeParse");
  const subscribe = createInboundBroadcast(
    ipc,
    "runtime:state",
    schema,
    (value) => [value.threadId],
  );
  const a = vi.fn(),
    b = vi.fn(),
    all = vi.fn();
  const releaseA = subscribe(a, "a"),
    releaseB = subscribe(b, "b"),
    releaseAll = subscribe(all);
  expect(ipc.on).toHaveBeenCalledOnce();
  receive({ privileged: true }, { threadId: "b", value: 1 });
  expect(parse).toHaveBeenCalledOnce();
  expect(a).not.toHaveBeenCalled();
  expect(b).toHaveBeenCalledExactlyOnceWith({ threadId: "b", value: 1 });
  expect(all).toHaveBeenCalledExactlyOnceWith({ threadId: "b", value: 1 });
  receive(null, { threadId: "b", value: "bad" });
  expect(b).toHaveBeenCalledTimes(1);
  releaseA();
  releaseB();
  expect(ipc.removeListener).not.toHaveBeenCalled();
  releaseAll();
  releaseAll();
  expect(ipc.removeListener).toHaveBeenCalledOnce();
  const releaseNext = subscribe(a, "a");
  expect(ipc.on).toHaveBeenCalledTimes(2);
  releaseNext();
});

import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../../shared/identity";
import type { AttentionEntry } from "../../contracts/attention";
import { ActivationBroker } from "./activation-broker";

function target(): AttentionEntry {
  const threadId = ThreadIdSchema.parse(randomUUID());
  return {
    threadId,
    eventId: randomUUID(),
    traceId: randomUUID(),
    kind: "needs-answer",
    unread: true,
    sourceTarget: {
      kind: "request",
      requestKey: {
        threadId,
        nativeSessionKey: "actual native 中文",
        connectionGeneration: randomUUID(),
        requestId: 'native [id] " 中文',
      },
    },
  };
}
it("waits for readiness, retains frozen FIFO targets across window replacement, and fences old renderer ACKs", () => {
  const broker = new ActivationBroker();
  const a = target(),
    b = target();
  expect(broker.enqueue(a)).toBe(true);
  expect(broker.enqueue(b)).toBe(true);
  expect(broker.current()).toBeNull();
  broker.ready("window-1", true);
  const first = broker.current()!;
  expect(first.target).toEqual(a);
  a.eventId = randomUUID();
  if (a.sourceTarget?.kind === "request")
    a.sourceTarget.requestKey.nativeSessionKey = "changed";
  expect(broker.current()).toEqual(first);
  expect(broker.complete(randomUUID(), "window-1")).toBe(false);
  broker.clearRenderer();
  expect(broker.current()).toBeNull();
  broker.ready("window-2", true);
  expect(broker.current()).toEqual(first);
  expect(broker.complete(first.id, "window-1")).toBe(false);
  broker.ready("window-1", false);
  expect(broker.current()).toEqual(first);
  expect(broker.complete(first.id, "window-2")).toBe(true);
  expect(broker.current()?.target).toEqual(b);
  broker.dispose();
  expect(broker.current()).toBeNull();
});
it("coalesces repeated clicks without losing earlier work and rejects overflow at a fixed queue budget", () => {
  const broker = new ActivationBroker(),
    a = target();
  broker.enqueue(a);
  broker.enqueue(a);
  for (let i = 0; i < 31; i++) expect(broker.enqueue(target())).toBe(true);
  expect(broker.enqueue(target())).toBe(false);
  broker.ready("window", true);
  let count = 0;
  while (broker.current()) {
    expect(broker.complete(broker.current()!.id, "window")).toBe(true);
    count++;
  }
  expect(count).toBe(32);
});

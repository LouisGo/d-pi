import { expect, it, vi } from "vitest";
import type { NativeFrame } from "../../../../platform/omp/protocol/public";
import type { NativeSubagentReadReply } from "./subagent-read";

const reply = (text: string): NativeSubagentReadReply => ({
  operationId: crypto.randomUUID(),
  traceId: crypto.randomUUID(),
  status: "available",
  text,
  truncated: false,
  childSessionId: "child",
});

import { NativeSubagentObservation } from "./subagent-observation";

const owner = {
  id: "native-id",
  parentToolCallId: "tool-call",
  sessionFile: "/native/task.jsonl",
  index: 0,
  agent: "task",
  agentSource: "builtin",
};
it("cancels a reused native owner's terminal read without putting transcript bodies on the control RPC", async () => {
  const request = vi.fn(
    async (_type: string): Promise<NativeFrame> => ({
      type: "response",
      success: true,
      data: { subagents: [] },
    }),
  );
  let finish: (reply: NativeSubagentReadReply) => void = () => {};
  const read = vi.fn(
    async (_owner: unknown, _signal?: AbortSignal) =>
      new Promise<NativeSubagentReadReply>((resolve) => {
        finish = resolve;
      }),
  );
  const frames: NativeFrame[] = [];
  const observation = new NativeSubagentObservation(
    request,
    (frame) => frames.push(frame),
    read,
  );
  try {
    observation.accept({
      type: "subagent_lifecycle",
      payload: { ...owner, status: "started" },
    });
    observation.accept({
      type: "subagent_lifecycle",
      payload: { ...owner, status: "completed" },
    });
    await Promise.resolve();
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining(owner),
      expect.any(AbortSignal),
    );
    const signal = read.mock.calls[0]?.[1];
    expect(signal?.aborted).toBe(false);
    observation.accept({
      type: "subagent_lifecycle",
      payload: {
        ...owner,
        parentToolCallId: "new-call",
        sessionFile: "/native/new.jsonl",
        status: "started",
      },
    });
    expect(signal?.aborted).toBe(true);
    expect(request).not.toHaveBeenCalled();
  } finally {
    observation.dispose();
    finish(reply("OLD_RESULT"));
    await Promise.resolve();
    await Promise.resolve();
  }
  expect(frames).toHaveLength(0);
});
it("subscribes before sampling and waits for physical read finalization on dispose", async () => {
  const request = vi.fn(
    async (_type: string): Promise<NativeFrame> => ({
      type: "response",
      success: true,
      data: { subagents: [] },
    }),
  );
  const frames: NativeFrame[] = [];
  let finish: (reply: NativeSubagentReadReply) => void = () => {};
  const read = vi.fn(
    async (_owner: unknown, _signal: AbortSignal) =>
      new Promise<NativeSubagentReadReply>((resolve) => {
        finish = resolve;
      }),
  );
  const observation = new NativeSubagentObservation(
    request,
    (frame) => frames.push(frame),
    read,
  );
  await observation.start();
  expect(request.mock.calls.map((call) => call[0])).toEqual([
    "set_subagent_subscription",
    "get_subagents",
  ]);
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...owner, status: "completed" },
  });
  let released = false;
  const closing = observation.dispose().then(() => {
    released = true;
  });
  await Promise.resolve();
  expect(read.mock.calls[0]?.[1].aborted).toBe(true);
  expect(released).toBe(false);
  finish(reply("final"));
  await closing;
  expect(
    frames.filter((frame) => frame.type === "d_pi_subagent_transcript"),
  ).toHaveLength(0);
});
it("names oversized evidence without using a transcript control RPC", async () => {
  const frames: NativeFrame[] = [];
  const request = vi.fn(
    async (_type: string): Promise<NativeFrame> => ({ type: "response" }),
  );
  const observation = new NativeSubagentObservation(
    request,
    (frame) => frames.push(frame),
    async () => ({
      operationId: crypto.randomUUID(),
      traceId: crypto.randomUUID(),
      status: "unavailable",
      reason: "transcript-too-large",
    }),
  );
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...owner, status: "completed" },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(request).not.toHaveBeenCalled();
  expect(frames).toMatchObject([
    { payload: { status: "unavailable", reason: "transcript-too-large" } },
  ]);
  await observation.dispose();
});
it("keeps a physical permit through old-owner cancellation and attributes only the replacement", async () => {
  const frames: NativeFrame[] = [];
  const finish: ((reply: NativeSubagentReadReply) => void)[] = [];
  const read = vi.fn(
    async (_owner: unknown, _signal: AbortSignal) =>
      new Promise<NativeSubagentReadReply>((resolve) => {
        finish.push(resolve);
      }),
  );
  const observation = new NativeSubagentObservation(
    async () => ({ type: "response" }),
    (frame) => frames.push(frame),
    read,
  );
  for (const candidate of [owner, { ...owner, id: "other" }])
    observation.accept({
      type: "subagent_lifecycle",
      payload: { ...candidate, status: "completed" },
    });
  const next = {
    ...owner,
    parentToolCallId: "new-call",
    sessionFile: "/native/new.jsonl",
  };
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...next, status: "started" },
  });
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...next, status: "completed" },
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(read.mock.calls[0]?.[1].aborted).toBe(true);
  finish[0]?.(reply("old"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(read).toHaveBeenCalledTimes(3);
  finish[1]?.(reply("other"));
  finish[2]?.(reply("new"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(frames.map((frame) => frame.payload)).toMatchObject([
    { id: "other", text: "other" },
    { id: "native-id", parentToolCallId: "new-call", text: "new" },
  ]);
  await observation.dispose();
});

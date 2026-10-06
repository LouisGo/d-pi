import { expect, it, vi } from "vitest";
import type { NativeFrame } from "../../../../platform/omp/protocol/public";
import { NativeSubagentObservation } from "./subagent-observation";

const owner = {
  id: "native-id",
  parentToolCallId: "tool-call",
  sessionFile: "/native/task.jsonl",
  index: 0,
  agent: "task",
  agentSource: "builtin",
};
it("subscribes before sampling, reads a terminal by native identity only and drops disposed replies", async () => {
  const frames: NativeFrame[] = [];
  const calls: unknown[] = [];
  let resolve: (value: NativeFrame) => void = () => {};
  const request = vi.fn(
    async (type: string, payload?: unknown): Promise<NativeFrame> => {
      calls.push([type, payload]);
      if (type === "set_subagent_subscription")
        return { type: "response", success: true, data: { level: "events" } };
      if (type === "get_subagents")
        return { type: "response", success: true, data: { subagents: [] } };
      return new Promise((r) => {
        resolve = r;
      });
    },
  );
  const observation = new NativeSubagentObservation(
    request,
    (frame) => frames.push(frame),
    async () => ({ size: 100 }),
  );
  await observation.start();
  expect(
    calls.map((value) => (Array.isArray(value) ? value[0] : null)),
  ).toEqual(["set_subagent_subscription", "get_subagents"]);
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...owner, status: "started" },
  });
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...owner, status: "completed" },
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(calls[2]).toEqual([
    "get_subagent_messages",
    { subagentId: "native-id" },
  ]);
  observation.dispose();
  resolve({
    type: "response",
    success: true,
    data: {
      sessionFile: owner.sessionFile,
      fromByte: 0,
      nextByte: 100,
      reset: false,
      messages: [],
    },
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(
    frames.filter((frame) => frame.type === "d_pi_subagent_transcript"),
  ).toHaveLength(0);
});
it("limits transcript reads and names missing/large evidence without pretending an empty result", async () => {
  const frames: NativeFrame[] = [];
  const request = vi.fn(async () => ({
    type: "response",
    success: true,
    data: { subagents: [] },
  }));
  const observation = new NativeSubagentObservation(
    request,
    (frame) => frames.push(frame),
    async () => ({ size: 2 * 1024 * 1024 }),
  );
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...owner, status: "started" },
  });
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...owner, status: "completed" },
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(request).not.toHaveBeenCalled();
  expect(frames).toMatchObject([
    {
      type: "d_pi_subagent_transcript",
      payload: { status: "unavailable", reason: "transcript-too-large" },
    },
  ]);
  observation.dispose();
});
it("reads native identities reused by later parent calls without merging old transcript replies", async () => {
  const frames: NativeFrame[] = [];
  const request = vi.fn(
    async (_type: string, _payload?: unknown): Promise<NativeFrame> => ({
      type: "response",
      success: true,
      data: {
        sessionFile: "/native/new.jsonl",
        fromByte: 0,
        nextByte: 100,
        reset: false,
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "toolCall",
                name: "yield",
                arguments: { data: { result: "NEW_RUN_RESULT" } },
              },
            ],
          },
        ],
      },
    }),
  );
  const observation = new NativeSubagentObservation(
    request,
    (frame) => frames.push(frame),
    async () => ({ size: 100 }),
  );
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...owner, status: "started" },
  });
  observation.accept({
    type: "subagent_lifecycle",
    payload: { ...owner, status: "completed" },
  });
  const next = {
    ...owner,
    parentToolCallId: "new-parent",
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
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(frames).toMatchObject([
    {
      type: "d_pi_subagent_transcript",
      payload: {
        parentToolCallId: "new-parent",
        status: "available",
        text: '{"result":"NEW_RUN_RESULT"}',
      },
    },
  ]);
  observation.dispose();
});

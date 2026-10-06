import { expect, it } from "vitest";
import { ConversationProjection } from "./projection";

const lifecycle = (
  status = "started",
  id = "same-name",
  parentToolCallId = "call-a",
) => ({
  type: "subagent_lifecycle",
  payload: {
    id,
    index: 0,
    agent: "task",
    agentSource: "builtin",
    status,
    parentToolCallId,
    sessionFile: `/native/${parentToolCallId}.jsonl`,
  },
});
it("keeps distinct native runs, ignores late owners, and never settles on main agent_end", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept(lifecycle());
  p.accept(lifecycle("started", "other-run", "call-b"));
  p.accept({ type: "agent_end" });
  expect(p.snapshot().items.filter((item) => item.subagent)).toHaveLength(2);
  expect(
    p
      .snapshot()
      .items.filter((item) => item.subagent)
      .map((item) => item.subagent?.status),
  ).toEqual(["running", "running"]);
  p.accept(lifecycle("completed"));
  p.accept(lifecycle("started"));
  p.accept({
    type: "subagent_progress",
    payload: {
      index: 0,
      agent: "task",
      agentSource: "builtin",
      task: "old",
      parentToolCallId: "wrong",
      sessionFile: "/wrong",
      progress: { id: "same-name", status: "running", recentOutput: ["wrong"] },
    },
  });
  expect(p.snapshot().items[0]?.subagent?.status).toBe("completed");
  expect(JSON.stringify(p.snapshot())).not.toContain("/native/");
  p.dispose();
});
it("shows live final output, transcript evidence and explicit bounded truncation", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept(lifecycle());
  p.accept({
    type: "subagent_event",
    payload: {
      id: "same-name",
      event: {
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "final native text" }],
        },
      },
    },
  });
  p.accept(lifecycle("completed"));
  expect(p.snapshot().items[0]).toMatchObject({
    text: "final native text",
    subagent: { status: "completed", resultSource: "live" },
  });
  p.accept({
    type: "d_pi_subagent_transcript",
    payload: {
      id: "same-name",
      parentToolCallId: "call-a",
      sessionFile: "/native/call-a.jsonl",
      status: "available",
      text: "x".repeat(100000),
      reset: false,
    },
  });
  expect(p.snapshot().items[0]?.text.length).toBeLessThan(70000);
  expect(p.snapshot().items[0]).toMatchObject({
    truncated: true,
    subagent: { resultSource: "transcript", coverage: "partial" },
  });
  p.dispose();
});
it("initializes only native active tasks and exposes unavailable reads without inventing terminal state", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept({
    type: "response",
    command: "get_subagents",
    success: true,
    data: {
      subagents: [
        {
          id: "native",
          index: 0,
          agent: "task",
          agentSource: "builtin",
          status: "running",
          lastUpdate: 1,
          parentToolCallId: "call-a",
          sessionFile: "/native/a",
        },
      ],
    },
  });
  p.accept({
    type: "d_pi_subagent_transcript",
    payload: {
      id: "native",
      parentToolCallId: "call-a",
      sessionFile: "/native/a",
      status: "unavailable",
      reason: "transcript-unavailable",
    },
  });
  expect(p.snapshot().items[0]).toMatchObject({
    subagent: {
      nativeId: "native",
      status: "running",
      coverage: "partial",
      reason: "transcript-unavailable",
    },
  });
  p.dispose();
});
it("marks loss of native observation unknown while preserving completed runs and results", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept(lifecycle());
  p.accept(lifecycle("started", "other-run", "call-b"));
  p.accept(lifecycle("completed"));
  p.accept({ type: "d_pi_subagent_observation_unavailable" });
  p.accept({ type: "d_pi_subagent_observation_unavailable" });
  expect(p.snapshot().items.filter((item) => item.subagentNotice)).toHaveLength(
    1,
  );
  expect(
    p
      .snapshot()
      .items.filter((item) => item.subagent)
      .map((item) => item.subagent?.status),
  ).toEqual(["completed", "unknown"]);
  p.dispose();
});
it("keeps same native task name across parent calls and does not attribute ownerless late output", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept(lifecycle());
  p.accept(lifecycle("completed"));
  p.accept(lifecycle("started", "same-name", "call-b"));
  p.accept({
    type: "subagent_event",
    payload: {
      id: "same-name",
      event: {
        type: "message_end",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "unattributed" }],
        },
      },
    },
  });
  expect(p.snapshot().items.filter((item) => item.subagent)).toHaveLength(2);
  expect(p.snapshot().items.map((item) => item.text)).not.toContain(
    "unattributed",
  );
  p.dispose();
});
it("shows streamed text and structured yield results without treating child agent_end as terminal", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept(lifecycle());
  p.accept({
    type: "subagent_event",
    payload: {
      id: "same-name",
      event: {
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", delta: "partial" },
      },
    },
  });
  expect(p.snapshot().items[0]?.text).toBe("partial");
  p.accept({
    type: "subagent_event",
    payload: { id: "same-name", event: { type: "agent_end" } },
  });
  expect(p.snapshot().items[0]?.subagent?.status).toBe("running");
  p.accept({
    type: "subagent_event",
    payload: {
      id: "same-name",
      event: {
        type: "message_end",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Finished." },
            {
              type: "toolCall",
              name: "yield",
              arguments: { data: { answer: 42 }, error: null, type: null },
            },
          ],
        },
      },
    },
  });
  expect(p.snapshot().items[0]?.text).toBe('{"answer":42}');
  p.dispose();
});
it("makes unknown child events and oversized native snapshots visible rather than discarding them silently", () => {
  const p = new ConversationProjection(crypto.randomUUID(), () => {});
  p.accept(lifecycle());
  p.accept({
    type: "subagent_event",
    payload: {
      id: "same-name",
      event: { type: "future_child_event", secret: "not-rendered" },
    },
  });
  expect(p.snapshot().items[0]?.subagent).toMatchObject({
    coverage: "partial",
    unhandledEvent: "future_child_event",
  });
  expect(JSON.stringify(p.snapshot())).not.toContain("not-rendered");
  p.accept({
    type: "response",
    command: "get_subagents",
    success: true,
    data: {
      subagents: Array.from({ length: 129 }, (_, index) => ({
        id: `task-${index}`,
        index,
        agent: "task",
        agentSource: "builtin",
        status: "running",
        lastUpdate: 0,
      })),
    },
  });
  expect(
    p
      .snapshot()
      .items.some((item) => item.subagentNotice === "observation-limit"),
  ).toBe(true);
  p.dispose();
});

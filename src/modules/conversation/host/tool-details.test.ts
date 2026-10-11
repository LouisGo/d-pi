import { expect, it } from "vitest";
import type { NativeFrame } from "../../../platform/omp/protocol/public";
import type { ToolDetailReply } from "../../resources/contracts/public";
import { ToolDetails } from "./tool-details";

it("reads raw progress independently of card truncation, replaces progress with final and releases only reader", () => {
  const identity = {
    threadId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    nativeSessionKey: "native-session",
  };
  const replies: ToolDetailReply[] = [];
  const details = new ToolDetails(identity);
  const source = {
    kind: "live-tool" as const,
    ...identity,
    toolCallId: "bash-1",
  };
  const readerId = crypto.randomUUID();
  const frame = (type: string, fields: object) =>
    details.accept({
      type,
      toolCallId: "bash-1",
      toolName: "bash",
      ...fields,
    } as NativeFrame);
  frame("tool_execution_start", { args: { command: "printf hello" } });
  details.watch(readerId, source, (value) => replies.push(value));
  frame("tool_execution_update", {
    partialResult: {
      content: [{ type: "text", text: "progress ".repeat(8000) }],
    },
  });
  expect(replies.at(-1)).toMatchObject({
    kind: "tool-detail",
    detail: {
      text: "progress ".repeat(8000),
      lifecycle: "running",
      argumentsText: '{"command":"printf hello"}',
    },
  });
  frame("tool_execution_end", {
    result: { content: [{ type: "text", text: "final" }] },
    isError: false,
  });
  details.accept({
    type: "message_end",
    dPiRecordId: "native-record",
    message: {
      role: "toolResult",
      toolCallId: "bash-1",
      content: [{ type: "text", text: "final" }],
    },
  } as NativeFrame);
  expect(replies.at(-1)).toMatchObject({
    kind: "tool-detail",
    detail: {
      text: "final",
      lifecycle: "completed",
      nativeRecordId: "native-record",
      coverage: "observed",
    },
  });
  details.release(readerId);
  const count = replies.length;
  frame("tool_execution_update", {
    partialResult: { content: [{ type: "text", text: "background" }] },
  });
  expect(replies).toHaveLength(count);
  details.dispose();
});

it("rejects foreign source and marks missing lifecycle / bounded bytes truthfully", () => {
  const identity = {
    threadId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    nativeSessionKey: "native",
  };
  const details = new ToolDetails(identity);
  const source = { kind: "live-tool" as const, ...identity, toolCallId: "x" };
  const replies: ToolDetailReply[] = [];
  details.accept({
    type: "tool_execution_update",
    toolCallId: "x",
    toolName: "bash",
    partialResult: { content: [{ type: "text", text: "🙂".repeat(100000) }] },
  } as NativeFrame);
  details.watch(crypto.randomUUID(), source, (reply) => replies.push(reply));
  const reply = replies.at(-1);
  expect(reply).toMatchObject({
    kind: "tool-detail",
    detail: { coverage: "partial", truncated: true },
  });
  if (reply?.kind === "tool-detail")
    expect(
      new TextEncoder().encode(reply.detail.text).byteLength,
    ).toBeLessThanOrEqual(262144);
  details.watch(
    crypto.randomUUID(),
    { ...source, nativeSessionKey: "other" },
    (reply) => replies.push(reply),
  );
  expect(replies.at(-1)).toMatchObject({
    kind: "tool-unavailable",
    reason: "identity-changed",
  });
});

it("keeps native truncation partial even when the observed text fits the App budget", () => {
  const scope = {
    threadId: crypto.randomUUID(),
    connectionGeneration: crypto.randomUUID(),
    nativeSessionKey: "native",
  };
  const details = new ToolDetails(scope);
  let latest: ToolDetailReply | undefined;
  details.accept({
    type: "tool_execution_start",
    toolCallId: "bash",
    toolName: "bash",
    args: { command: "large output" },
  } as NativeFrame);
  details.watch(
    crypto.randomUUID(),
    { kind: "live-tool", ...scope, toolCallId: "bash" },
    (reply) => {
      latest = reply;
    },
  );
  details.accept({
    type: "tool_execution_end",
    toolCallId: "bash",
    toolName: "bash",
    result: {
      content: [{ type: "text", text: "native tail" }],
      details: {
        meta: {
          truncation: {
            direction: "tail",
            truncatedBy: "bytes",
            artifactId: "real-artifact",
          },
        },
      },
    },
  } as NativeFrame);
  expect(latest).toMatchObject({
    kind: "tool-detail",
    detail: { text: "native tail", truncated: true, coverage: "partial" },
  });
  details.dispose();
});

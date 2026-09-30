import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { ConversationProjection } from "../../src/modules/conversation/host/public";
import {
  FrameDecoder,
  isNativeFrameType,
  NativeFrameTypes,
} from "../../src/platform/omp/protocol/public";

it("decodes and projects the recorded official 18.3.0 stop/continue session with its original frame order", () => {
  // Captured from the unchanged official SDK with an isolated local provider
  // fixture. This proves SDK boundary compatibility, not a real provider run.
  const bytes = readFileSync(
    new URL(
      "../../.scratch/rewrite-preparation/evidence/sdk-control.frames.jsonl",
      import.meta.url,
    ),
  );
  const projection = new ConversationProjection("replay-generation", () => {});
  const responses: { command: string; success: boolean }[] = [];
  const decoder = new FrameDecoder((frame) => {
    if (isNativeFrameType(frame, NativeFrameTypes.response))
      responses.push(frame);
    projection.accept(frame);
  });
  try {
    // Split physical input independently of the original process read sizes.
    for (let start = 0; start < bytes.length; start += 31)
      decoder.push(bytes.subarray(start, start + 31));
    decoder.end();
    expect(responses).toContainEqual(
      expect.objectContaining({ command: "prompt", success: true }),
    );
    expect(responses).toContainEqual(
      expect.objectContaining({ command: "d_pi_continue", success: false }),
    );
    expect(responses).toContainEqual(
      expect.objectContaining({ command: "d_pi_continue", success: true }),
    );
    const snapshot = projection.snapshot();
    expect(snapshot.gap).toBe(false);
    expect(snapshot.items).toContainEqual(
      expect.objectContaining({ role: "user", text: "SECOND" }),
    );
    expect(snapshot.items).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        state: "complete",
        text: "RESPONSE",
      }),
    );
  } finally {
    projection.dispose();
  }
});

it("retains the official SDK's asynchronous failure after ACK under one request identity", () => {
  const bytes = readFileSync(
    new URL(
      "../../.scratch/rewrite-preparation/evidence/sdk-failure.frames.jsonl",
      import.meta.url,
    ),
  );
  const responses: { id?: string; success: boolean }[] = [];
  const decoder = new FrameDecoder((frame) => {
    if (isNativeFrameType(frame, NativeFrameTypes.response))
      responses.push(frame);
  });
  for (let start = 0; start < bytes.length; start += 7)
    decoder.push(bytes.subarray(start, start + 7));
  decoder.end();
  expect(responses.map((response) => response.success)).toEqual([true, false]);
  expect(new Set(responses.map((response) => response.id)).size).toBe(1);
});

import { expect, it } from "vitest";
import { FrameDecoder } from "./frame-decoder";

it("decodes split UTF-8 JSONL and v2 chunks into original frames", () => {
  const frames: unknown[] = [];
  const decoder = new FrameDecoder((frame) => frames.push(frame));
  const first = Buffer.from(
    JSON.stringify({ type: "ready", text: "中文" }) + "\n",
  );
  for (const byte of first) decoder.push(Buffer.from([byte]));
  const payload = Buffer.from(
    JSON.stringify({ type: "message_update", text: "更多输出" }),
  );
  for (const [index, part] of [
    payload.subarray(0, 7),
    payload.subarray(7),
  ].entries()) {
    decoder.push(
      Buffer.from(
        JSON.stringify({
          type: "rpc_chunk",
          chunkId: "test",
          index,
          count: 2,
          byteLength: payload.length,
          data: part.toString("base64"),
        }) + "\n",
      ),
    );
  }
  decoder.end();
  expect(frames).toEqual([
    { type: "ready", text: "中文" },
    { type: "message_update", text: "更多输出" },
  ]);
});

it("rejects missing/interleaved/oversized chunks and invalid UTF-8 without publishing partial content", () => {
  const chunk = {
    type: "rpc_chunk",
    chunkId: "a",
    index: 0,
    count: 2,
    byteLength: 4,
    data: "e30=",
  };
  const encoded = (value: unknown) => Buffer.from(JSON.stringify(value) + "\n");
  for (const second of [
    { ...chunk, index: 1, chunkId: "b" },
    { ...chunk, index: 0 },
    { type: "ready" },
  ]) {
    const emitted: unknown[] = [];
    const d = new FrameDecoder((f) => emitted.push(f));
    d.push(encoded(chunk));
    expect(() => d.push(encoded(second))).toThrow();
    expect(emitted).toEqual([]);
  }
  expect(() =>
    new FrameDecoder(() => {}, 10).push(Buffer.alloc(11, 65)),
  ).toThrow();
  expect(() =>
    new FrameDecoder(() => {}, 1024, 3).push(encoded(chunk)),
  ).toThrow();
  expect(() =>
    new FrameDecoder(() => {}).push(Buffer.from([0xff, 10])),
  ).toThrow();
  const truncated = new FrameDecoder(() => {});
  truncated.push(encoded(chunk));
  expect(() => truncated.end()).toThrow();
});

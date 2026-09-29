import { z } from "zod";
import { type NativeFrame, NativeFrameSchema } from "./native-frame";

const ChunkSchema = z.object({
  type: z.literal("rpc_chunk"),
  chunkId: z.string().min(1),
  index: z.number().int().nonnegative(),
  count: z.number().int().positive().max(65536),
  byteLength: z.number().int().positive(),
  data: z.string(),
});
// Limits from the fixed v18.3.0 protocol. Reassembly and projection have separate budgets.
export class FrameDecoder {
  private readonly utf8 = new TextDecoder("utf-8", { fatal: true });
  private lines: Buffer[] = [];
  private lineBytes = 0;
  private chunks: {
    id: string;
    count: number;
    index: number;
    expectedBytes: number;
    bytes: number;
    parts: Buffer[];
  } | null = null;
  private failed = false;
  constructor(
    private readonly emit: (frame: NativeFrame) => void,
    private readonly maxPhysical = 1048576,
    private readonly maxLogical = 67108864,
  ) {}
  push(bytes: Uint8Array): void {
    if (this.failed) throw new Error("Decoder closed after invalid frame");
    try {
      const input = Buffer.from(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      let start = 0;
      while (start < input.length) {
        const newline = input.indexOf(10, start);
        const end = newline < 0 ? input.length : newline;
        const part = input.subarray(start, end);
        this.lineBytes += part.length;
        if (this.lineBytes + 1 > this.maxPhysical)
          throw new Error("Physical frame exceeds budget");
        if (part.length) this.lines.push(Buffer.from(part));
        if (newline < 0) break;
        const line = Buffer.concat(this.lines, this.lineBytes);
        this.lines = [];
        this.lineBytes = 0;
        if (line.length)
          this.frame(
            NativeFrameSchema.parse(JSON.parse(this.utf8.decode(line))),
          );
        start = newline + 1;
      }
    } catch (error) {
      this.failed = true;
      this.lines = [];
      this.lineBytes = 0;
      this.chunks = null;
      throw error;
    }
  }
  private frame(frame: NativeFrame): void {
    if (frame.type !== "rpc_chunk") {
      if (this.chunks) throw new Error("Interrupted chunk sequence");
      this.emit(frame);
      return;
    }
    const chunk = ChunkSchema.parse(frame);
    if (chunk.byteLength > this.maxLogical || chunk.index >= chunk.count)
      throw new Error("Invalid chunk budget or index");
    if (!this.chunks) {
      if (chunk.index !== 0) throw new Error("Missing initial chunk");
      this.chunks = {
        id: chunk.chunkId,
        count: chunk.count,
        index: 0,
        expectedBytes: chunk.byteLength,
        bytes: 0,
        parts: [],
      };
    }
    const pending = this.chunks;
    if (
      pending.id !== chunk.chunkId ||
      pending.count !== chunk.count ||
      pending.index !== chunk.index ||
      pending.expectedBytes !== chunk.byteLength
    )
      throw new Error("Interleaved or missing chunk");
    const part = Buffer.from(chunk.data, "base64");
    if (!part.length || part.toString("base64") !== chunk.data)
      throw new Error("Invalid base64");
    pending.bytes += part.length;
    if (pending.bytes > pending.expectedBytes)
      throw new Error("Chunk length exceeded");
    pending.parts.push(part);
    pending.index++;
    if (pending.index === pending.count) {
      if (pending.bytes !== pending.expectedBytes)
        throw new Error("Incomplete logical frame");
      const decoded = NativeFrameSchema.parse(
        JSON.parse(
          this.utf8.decode(Buffer.concat(pending.parts, pending.bytes)),
        ),
      );
      this.chunks = null;
      if (decoded.type === "rpc_chunk") throw new Error("Nested chunk frame");
      this.emit(decoded);
    }
  }
  end(): void {
    if (this.lineBytes || this.chunks) {
      this.failed = true;
      this.lines = [];
      this.chunks = null;
      this.lineBytes = 0;
      throw new Error("Truncated native stream");
    }
  }
}

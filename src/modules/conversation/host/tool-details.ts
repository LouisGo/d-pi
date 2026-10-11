import type { NativeFrame } from "../../../platform/omp/protocol/public";
import type {
  SourceRef,
  ToolDetail,
  ToolDetailReply,
} from "../../resources/contracts/public";

export type ToolScope = {
  threadId: string;
  connectionGeneration: string;
  nativeSessionKey: string;
};
type Entry = Omit<ToolDetail, "source" | "contentRevision"> & {
  version: number;
  started: boolean;
};
type Reader = {
  source: Extract<SourceRef, { kind: "live-tool" }>;
  send: (event: ToolDetailReply) => void;
};
const MAX_TEXT = 256 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024;
function bounded(
  text: string,
  bytes: number,
): { text: string; truncated: boolean } {
  const value = Buffer.from(text);
  if (value.byteLength <= bytes) return { text, truncated: false };
  let end = bytes;
  while ((value[end] ?? 0) >> 6 === 2) end--;
  return { text: value.subarray(0, end).toString("utf8"), truncated: true };
}
function textOf(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object" || !("content" in payload))
    return "";
  const content = payload.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part) =>
      part &&
      typeof part === "object" &&
      part.type === "text" &&
      typeof part.text === "string"
        ? [part.text]
        : [],
    )
    .join("\n");
}
/** Host-owned raw observation cache, independent of timeline projection and execution. */
export class ToolDetails {
  private readonly entries = new Map<string, Entry>();
  private readonly readers = new Map<string, Reader>();
  constructor(private scope: ToolScope) {}
  bind(scope: ToolScope): void {
    if (
      this.scope.nativeSessionKey &&
      this.scope.nativeSessionKey !== scope.nativeSessionKey
    ) {
      this.entries.clear();
      for (const [id, reader] of this.readers)
        reader.send({
          kind: "tool-unavailable",
          readerId: id,
          reason: "identity-changed",
        });
      this.readers.clear();
    }
    this.scope = scope;
  }
  watch(readerId: string, source: SourceRef, send: Reader["send"]): void {
    if (
      source.kind !== "live-tool" ||
      source.threadId !== this.scope.threadId ||
      source.nativeSessionKey !== this.scope.nativeSessionKey ||
      source.connectionGeneration !== this.scope.connectionGeneration
    ) {
      send({ kind: "tool-unavailable", readerId, reason: "identity-changed" });
      return;
    }
    if (this.readers.size >= 8 && !this.readers.has(readerId)) {
      send({ kind: "tool-unavailable", readerId, reason: "limit" });
      return;
    }
    this.readers.set(readerId, { source, send });
    this.publish(readerId);
  }
  release(readerId: string): void {
    this.readers.delete(readerId);
  }
  private publish(readerId: string): void {
    const reader = this.readers.get(readerId);
    if (!reader) return;
    const entry = this.entries.get(reader.source.toolCallId);
    if (!entry) {
      reader.send({ kind: "tool-unavailable", readerId, reason: "missing" });
      return;
    }
    const { version, started: _started, ...detail } = entry;
    reader.send({
      kind: "tool-detail",
      readerId,
      detail: {
        ...detail,
        source: reader.source,
        contentRevision: String(version),
      },
    });
  }
  accept(frame: NativeFrame): void {
    const value = frame as Record<string, unknown>;
    const type = value.type;
    const record =
      type === "message_end" &&
      value.message &&
      typeof value.message === "object"
        ? (value.message as Record<string, unknown>)
        : null;
    if (record && record.role !== "toolResult" && record.role !== "tool")
      return;
    if (
      !record &&
      type !== "tool_execution_start" &&
      type !== "tool_execution_update" &&
      type !== "tool_execution_end"
    )
      return;
    const toolCallId = record?.toolCallId ?? value.toolCallId;
    if (
      typeof toolCallId !== "string" ||
      !toolCallId ||
      toolCallId.length > 512
    )
      return;
    const previous = this.entries.get(toolCallId);
    const entry: Entry = previous ?? {
      toolName: String(value.toolName ?? record?.toolName ?? "tool").slice(
        0,
        512,
      ),
      argumentsText: "",
      text: "",
      lifecycle: "unknown",
      coverage: "partial",
      truncated: false,
      version: 0,
      started: false,
    };
    if (type === "tool_execution_start") {
      entry.started = true;
      entry.lifecycle = "running";
    }
    if (value.args !== undefined) {
      const args = bounded(JSON.stringify(value.args) ?? "", 32768);
      entry.argumentsText = args.text;
      entry.truncated ||= args.truncated;
    }
    const payload =
      record ??
      (type === "tool_execution_update" ? value.partialResult : value.result);
    if (payload !== undefined && payload !== null) {
      const output = bounded(textOf(payload), MAX_TEXT);
      entry.text = output.text;
      entry.truncated ||= output.truncated;
    }
    if (type === "tool_execution_update" && !previous)
      entry.lifecycle = "running";
    if (type === "tool_execution_end" || record)
      entry.lifecycle =
        (record?.isError ?? value.isError) === true ? "failed" : "completed";
    if (typeof value.dPiRecordId === "string")
      entry.nativeRecordId = value.dPiRecordId;
    entry.coverage = entry.started && !entry.truncated ? "observed" : "partial";
    entry.version++;
    this.entries.delete(toolCallId);
    this.entries.set(toolCallId, entry);
    let total = 0;
    for (const item of this.entries.values())
      total +=
        Buffer.byteLength(item.text) + Buffer.byteLength(item.argumentsText);
    for (const [id, item] of this.entries) {
      if (this.entries.size <= 64 && total <= MAX_TOTAL) break;
      // Active readers retain their content; eight max-size readers can exceed
      // the total budget, so even watched oldest content may be evicted honestly.
      this.entries.delete(id);
      total -=
        Buffer.byteLength(item.text) + Buffer.byteLength(item.argumentsText);
      for (const [readerId, reader] of this.readers)
        if (reader.source.toolCallId === id) this.publish(readerId);
    }
    for (const [readerId, reader] of this.readers)
      if (reader.source.toolCallId === toolCallId) this.publish(readerId);
  }
  dispose(): void {
    this.readers.clear();
    this.entries.clear();
  }
}

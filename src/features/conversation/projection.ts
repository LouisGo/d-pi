import { z } from "zod";
import type { NativeFrame } from "../../host/frame-decoder";
import { draftByteLength } from "../../shared/draft-text";
import type {
  ConversationItem,
  ConversationSnapshot,
  ConversationUpdate,
} from "./contracts";

const MessageSchema = z.object({
  role: z.string(),
  content: z.unknown(),
  toolCallId: z.string().optional(),
  isError: z.boolean().optional(),
  errorMessage: z.string().optional(),
});
const TextSchema = z.object({ type: z.literal("text"), text: z.string() });
function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part: unknown) => {
      const parsed = TextSchema.safeParse(part);
      return parsed.success ? [parsed.data.text] : [];
    })
    .join("\n");
}
export class ConversationProjection {
  private items: ConversationItem[] = [];
  private nextId = 1;
  private sizes = new Map<number, number>();
  private bytes = 2;
  private seq = 0;
  private gap = false;
  private active: number | null = null;
  private tools = new Map<string, number>();
  private pending = new Map<number, ConversationItem>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unknownTypes = new Set<string>();
  constructor(
    private readonly generation: string,
    private readonly emit: (event: ConversationUpdate) => void,
    private readonly budget = 8 * 1024 * 1024,
  ) {}
  accept(frame: NativeFrame): void {
    if (["message_start", "message_end"].includes(frame.type)) {
      const parsed = MessageSchema.safeParse(frame.message);
      if (!parsed.success) return;
      this.flush();
      const message = parsed.data;
      const role =
        message.role === "assistant"
          ? "assistant"
          : message.role === "user"
            ? "user"
            : "tool";
      const tool = message.toolCallId
        ? this.tools.get(message.toolCallId)
        : undefined;
      const existing = tool ?? (role === "assistant" ? this.active : null);
      const id = existing ?? this.nextId++;
      const text = textOf(message.content) || message.errorMessage || "";
      if (frame.type === "message_start" && role === "assistant")
        this.active = id;
      // Native user start/end share one append in the visible projection.
      if (frame.type === "message_start" && role !== "assistant") return;
      this.put({
        id,
        role,
        text,
        state:
          message.isError || message.errorMessage
            ? "failed"
            : frame.type === "message_end"
              ? "complete"
              : "streaming",
        label:
          role === "tool" ? "工具结果" : role === "user" ? "原生输入" : "OMP",
      });
      if (frame.type === "message_end") {
        if (role === "assistant") this.active = null;
        this.flush();
      }
      return;
    }
    if (frame.type === "message_update") {
      const delta = z
        .object({ type: z.literal("text_delta"), delta: z.string() })
        .safeParse(frame.assistantMessageEvent);
      if (!delta.success) return;
      const id = this.active ?? this.nextId++;
      this.active = id;
      const item = this.items.find((item) => item.id === id);
      this.put({
        id,
        role: "assistant",
        label: "OMP",
        state: "streaming",
        text: (item?.text ?? "") + delta.data.delta,
      });
      return;
    }
    if (["tool_execution_start", "tool_execution_end"].includes(frame.type)) {
      this.flush();
      const parsed = z
        .object({
          toolCallId: z.string(),
          toolName: z.string(),
          isError: z.boolean().optional(),
          result: z.unknown().optional(),
        })
        .safeParse(frame);
      if (!parsed.success) return;
      const id = this.tools.get(parsed.data.toolCallId) ?? this.nextId++;
      this.tools.set(parsed.data.toolCallId, id);
      const result = z
        .object({ content: z.unknown() })
        .safeParse(parsed.data.result);
      this.put({
        id,
        role: "tool",
        label: parsed.data.toolName.slice(0, 120),
        state: parsed.data.isError
          ? "failed"
          : frame.type === "tool_execution_end"
            ? "complete"
            : "streaming",
        text: result.success ? textOf(result.data.content) : "",
      });
      this.flush();
      return;
    }
    if (frame.type === "agent_end") {
      this.flush();
      return;
    }
    if (
      [
        "ready",
        "response",
        "agent_start",
        "turn_start",
        "turn_end",
        "tool_execution_update",
        "prompt_result",
        "available_commands_update",
        "session_info_update",
        "config_update",
      ].includes(frame.type)
    )
      return;
    if (
      frame.type === "extension_ui_request" &&
      ["setStatus", "setTitle", "setWidget"].includes(String(frame.method))
    )
      return;
    if (!this.unknownTypes.has(frame.type) && this.unknownTypes.size < 32) {
      this.unknownTypes.add(frame.type);
      this.flush();
      this.put({
        id: this.nextId++,
        role: "notice",
        state: "complete",
        label: "原生事件",
        text: `收到 ${frame.type.slice(0, 120)}。此类事件的完整交互尚未接入。`,
      });
      this.flush();
    }
  }
  private put(item: ConversationItem): void {
    if (this.budget < 1024) throw Error("Projection budget too small");
    let size = draftByteLength(JSON.stringify(item)) + 1;
    if (size + 2 > this.budget) {
      const bytes = new TextEncoder().encode(item.text);
      let limit = Math.min(bytes.length, this.budget - 512);
      do {
        item = {
          ...item,
          text:
            new TextDecoder().decode(bytes.subarray(0, limit)) +
            "\n[显示已截断；可读取原生记录核对]",
        };
        size = draftByteLength(JSON.stringify(item)) + 1;
        limit = Math.floor(limit / 2);
      } while (size + 2 > this.budget && limit > 0);
      this.gap = true;
    }
    const index = this.items.findIndex((value) => value.id === item.id);

    this.bytes += size - (this.sizes.get(item.id) ?? 0);
    this.sizes.set(item.id, size);
    if (index < 0) this.items.push(item);
    else this.items[index] = item;
    while (
      this.items.length > 1 &&
      (this.bytes > this.budget || this.items.length > 1000)
    ) {
      const dropped = this.items.shift();
      if (dropped) {
        this.pending.delete(dropped.id);
        this.bytes -= this.sizes.get(dropped.id) ?? 0;
        this.sizes.delete(dropped.id);
      }
      this.gap = true;
    }
    const retained = new Set(this.items.map((value) => value.id));
    for (const [key, id] of this.tools)
      if (!retained.has(id)) this.tools.delete(key);
    this.pending.set(item.id, item);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 32);
  }
  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    for (const item of this.pending.values())
      this.emit({
        kind: "update",
        generation: this.generation,
        seq: ++this.seq,
        item,
        droppedBefore: this.items[0]?.id ?? 0,
        gap: this.gap,
      });
    this.pending.clear();
  }
  snapshot(): ConversationSnapshot {
    this.flush();
    return {
      kind: "snapshot",
      generation: this.generation,
      seq: this.seq,
      items: this.items.map((item) => ({ ...item })),
      gap: this.gap,
    };
  }
  dispose(): void {
    clearTimeout(this.timer);
    this.pending.clear();
  }
}

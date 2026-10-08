import { z } from "zod";
import {
  isNativeFrameType,
  type NativeFrame,
  NativeFrameTypes,
} from "../../../platform/omp/protocol/public";
import { draftByteLength } from "../../../shared/draft-text";
import { uiMessage } from "../../../shared/messages/contracts";
import type {
  ConversationItem,
  ConversationSnapshot,
  ConversationUpdate,
} from "../contracts/public";

import { SubagentProjection } from "./subagent-projection";

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
  private readonly subagents = new SubagentProjection(
    () => this.nextId++,
    (item) => this.put(item),
  );
  private items: ConversationItem[] = [];
  private nextId = 1;
  private sizes = new Map<number, number>();
  private bytes = 2;
  private seq = 0;
  private gap = false;
  private active: number | null = null;
  private interrupted: number | null = null;
  private retryNotice: number | null = null;
  private tools = new Map<string, number>();
  private pending = new Map<number, ConversationItem>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unknownTypes = new Set<string>();
  constructor(
    private readonly connectionGeneration: string,
    private readonly emit: (event: ConversationUpdate) => void,
    private readonly budget = 8 * 1024 * 1024,
  ) {}
  accept(frame: NativeFrame): void {
    if (this.subagents.accept(frame)) return;
    if (
      isNativeFrameType(
        frame,
        NativeFrameTypes.messageStart,
        NativeFrameTypes.messageEnd,
      )
    ) {
      this.flush();
      const message = frame.message;
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
      const text = textOf(message.content);
      const prior = this.items.find((item) => item.id === existing);
      const continuationOf = prior?.continuationOf ?? this.interrupted;
      const ended = isNativeFrameType(frame, NativeFrameTypes.messageEnd);
      const state =
        message.stopReason === "aborted"
          ? "aborted"
          : message.stopReason === "error" ||
              message.isError ||
              message.errorMessage
            ? "failed"
            : ended
              ? "complete"
              : "streaming";
      if (
        isNativeFrameType(frame, NativeFrameTypes.messageStart) &&
        role === "assistant"
      )
        this.active = id;
      // Native user start/end share one append in the visible projection.
      if (
        isNativeFrameType(frame, NativeFrameTypes.messageStart) &&
        role !== "assistant"
      )
        return;
      this.put({
        id,
        role,
        text,
        state,
        ...(message.errorMessage
          ? { detail: message.errorMessage.slice(0, 4096) }
          : {}),
        ...(role === "assistant" && continuationOf !== null
          ? { continuationOf }
          : {}),
        label:
          role === "tool"
            ? { kind: "message", value: uiMessage("conversation.toolResult") }
            : role === "user"
              ? {
                  kind: "message",
                  value: uiMessage("conversation.nativeInput"),
                }
              : { kind: "literal", text: "OMP" },
      });
      if (isNativeFrameType(frame, NativeFrameTypes.messageEnd)) {
        if (role === "assistant") {
          this.active = null;
          this.interrupted =
            state === "failed" || state === "aborted" ? id : null;
        }
        if (role === "user") this.interrupted = null;
        this.flush();
      }
      return;
    }
    if (isNativeFrameType(frame, NativeFrameTypes.messageUpdate)) {
      const delta = z
        .object({ type: z.literal("text_delta"), delta: z.string() })
        .safeParse(frame.assistantMessageEvent);
      if (!delta.success) return;
      const id = this.active ?? this.nextId++;
      this.active = id;
      const item = this.items.find((item) => item.id === id);
      // The fixed full RPC stream carries the current message on each update.
      // A populated start can already include its first delta. Treat that full
      // snapshot as authoritative, never concatenate both representations.
      const snapshot = z
        .object({
          role: z.literal("assistant"),
          content: z.union([z.string(), z.array(z.unknown())]),
        })
        .safeParse(frame.message);
      this.put({
        id,
        role: "assistant",
        label: { kind: "literal", text: "OMP" },
        state: "streaming",
        text: snapshot.success
          ? textOf(snapshot.data.content)
          : (item?.text ?? "") + delta.data.delta,
        ...(item?.continuationOf !== undefined
          ? { continuationOf: item.continuationOf }
          : {}),
      });
      return;
    }
    if (isNativeFrameType(frame, NativeFrameTypes.promptResult)) {
      this.interrupted = null;
      this.retryNotice = null;
      return;
    }
    if (
      isNativeFrameType(
        frame,
        NativeFrameTypes.autoRetryStart,
        NativeFrameTypes.autoRetryEnd,
      )
    ) {
      const retry = z
        .object({
          attempt: z.number().int().nonnegative(),
          errorMessage: z.string().optional(),
          finalError: z.string().optional(),
          success: z.boolean().optional(),
        })
        .safeParse(frame);
      if (!retry.success) return;
      const id = this.retryNotice ?? this.nextId++;
      this.retryNotice = id;
      const ended = frame.type === NativeFrameTypes.autoRetryEnd;
      this.put({
        id,
        role: "notice",
        text: "",
        state: ended && retry.data.success === false ? "failed" : "complete",
        label: { kind: "literal", text: "OMP" },
        notice: uiMessage(
          ended
            ? retry.data.success === false
              ? "conversation.retryFailed"
              : "conversation.retryCompleted"
            : "conversation.retrying",
        ),
        ...((retry.data.errorMessage ?? retry.data.finalError)
          ? {
              detail: (
                retry.data.errorMessage ??
                retry.data.finalError ??
                ""
              ).slice(0, 4096),
            }
          : {}),
      });
      this.flush();
      return;
    }
    if (
      isNativeFrameType(
        frame,
        NativeFrameTypes.toolExecutionStart,
        NativeFrameTypes.toolExecutionEnd,
      )
    ) {
      this.flush();
      const id = this.tools.get(frame.toolCallId) ?? this.nextId++;
      this.tools.set(frame.toolCallId, id);
      const completed = isNativeFrameType(
        frame,
        NativeFrameTypes.toolExecutionEnd,
      )
        ? frame
        : null;
      const result = completed
        ? z.object({ content: z.unknown() }).safeParse(completed.result)
        : null;
      this.put({
        id,
        role: "tool",
        label: { kind: "literal", text: frame.toolName.slice(0, 120) },
        state: completed
          ? completed.isError
            ? "failed"
            : "complete"
          : "streaming",
        text: result?.success ? textOf(result.data.content) : "",
      });
      this.flush();
      return;
    }
    if (isNativeFrameType(frame, NativeFrameTypes.agentEnd)) {
      this.flush();
      return;
    }
    if (
      isNativeFrameType(
        frame,
        NativeFrameTypes.ready,
        NativeFrameTypes.response,
        NativeFrameTypes.agentStart,
        NativeFrameTypes.turnStart,
        NativeFrameTypes.turnEnd,
        NativeFrameTypes.toolExecutionUpdate,
        NativeFrameTypes.promptResult,
        NativeFrameTypes.availableCommandsUpdate,
        NativeFrameTypes.sessionInfoUpdate,
        NativeFrameTypes.configUpdate,
        // OMP 18.4.6 emits this when restoring cost metadata at startup,
        // even without a submission. It carries no conversation or interaction.
        NativeFrameTypes.advisorCostChanged,
        NativeFrameTypes.sessionSettled,
        NativeFrameTypes.thinkingLevelChanged,
        NativeFrameTypes.modelChanged,
      )
    )
      return;
    if (
      isNativeFrameType(frame, NativeFrameTypes.extensionUiRequest) &&
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
        label: {
          kind: "message",
          value: uiMessage("conversation.nativeEvent"),
        },
        text: "",
        notice: {
          code: "conversation.unsupportedNativeEvent",
          params: { eventType: frame.type.slice(0, 120) },
        },
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
          text: new TextDecoder().decode(bytes.subarray(0, limit)),
          truncated: true,
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
    this.subagents.retain(retained);
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
        connectionGeneration: this.connectionGeneration,
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
      connectionGeneration: this.connectionGeneration,
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

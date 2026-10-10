import { z } from "zod";
import {
  isNativeFrameType,
  type NativeFrame,
  NativeFrameTypes,
} from "../../../platform/omp/protocol/public";
import { draftByteLength } from "../../../shared/draft-text";
import { uiMessage } from "../../../shared/messages/contracts";
import { nativeMessageTime } from "../contracts/message-time";
import type {
  ConversationEvent,
  ConversationItem,
  ConversationSnapshot,
} from "../contracts/public";
import type {
  ToolExecutionObservation,
  ToolPayload,
} from "../contracts/tool-observation";

import { SubagentProjection } from "./subagent-projection";

const ReadingIdentitySchema = z.object({
  dPiRecordId: z.string().min(1).max(512).optional(),
  dPiRestored: z.boolean().optional(),
  dPiIdentityUnknown: z.boolean().optional(),
});
const TextSchema = z.object({ type: z.literal("text"), text: z.string() });
const DeltaSchema = z.object({
  type: z.enum(["text_delta", "thinking_delta"]),
  delta: z.string(),
});
const AssistantSnapshotSchema = z.object({
  role: z.literal("assistant"),
  content: z.union([z.string(), z.array(z.unknown())]),
});
const BackgroundStateSchema = z.object({
  details: z.object({
    async: z.object({ state: z.enum(["running", "completed", "failed"]) }),
  }),
});
const ThinkingSchema = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
});
function thinkingOf(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .flatMap((part: unknown) => {
      const parsed = ThinkingSchema.safeParse(part);
      return parsed.success ? [parsed.data.thinking] : [];
    })
    .join("\n");
}
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

function toolPayload(input: unknown): ToolPayload {
  let remaining = 8192;
  let nodes = 128;
  let truncated = false;
  const visit = (value: unknown, depth: number): ToolPayload["value"] => {
    if (--nodes < 0 || depth > 5 || remaining < 32) {
      truncated = true;
      remaining -= 4;
      return null;
    }
    if (value === null || typeof value === "boolean") {
      remaining -= 5;
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      remaining -= 32;
      return value;
    }
    if (typeof value === "string") {
      const limit = Math.min(1024, Math.floor((remaining - 2) / 6));
      const text = value.slice(0, limit);
      truncated ||= text.length !== value.length;
      remaining -= draftByteLength(JSON.stringify(text));
      return text;
    }
    if (Array.isArray(value)) {
      const result: ToolPayload["value"][] = [];
      remaining -= 2;
      for (let i = 0; i < value.length; i++) {
        if (i >= 32 || remaining < 16 || nodes <= 0) {
          truncated = true;
          break;
        }
        remaining--;
        result.push(visit(value[i], depth + 1));
      }
      return result;
    }
    if (typeof value === "object" && value !== null) {
      const result: Record<string, ToolPayload["value"]> = {};
      remaining -= 2;
      let count = 0;
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        // Binary image payloads are not a text/structured tool detail.
        if (key === "data" && "type" in value && value.type === "image") {
          truncated = true;
          continue;
        }
        const cost = draftByteLength(JSON.stringify(key)) + 2;
        if (
          ++count > 32 ||
          key.length > 120 ||
          remaining - cost < 16 ||
          nodes <= 0
        ) {
          truncated = true;
          break;
        }
        remaining -= cost;
        Object.defineProperty(result, key, {
          value: visit(Reflect.get(value, key), depth + 1),
          enumerable: true,
        });
      }
      return result;
    }
    truncated = true;
    remaining -= 4;
    return null;
  };
  return { value: visit(input, 0), truncated };
}
export class ConversationProjection {
  private readonly subagents = new SubagentProjection(
    () => this.nextId++,
    (item) => this.put(item),
  );
  private items = new Map<number, ConversationItem>();
  private nextId = 1;
  private sizes = new Map<number, number>();
  private bytes = 1;
  private seq = 0;
  private gap = false;
  private coveragePending = false;
  private active: number | null = null;
  private interrupted: number | null = null;
  private retryNotice: number | null = null;
  private tools = new Map<string, number>();
  private toolOwners = new Map<number, string>();
  private stream:
    | {
        id: number;
        snapshot: unknown;
        snapshotDelta: z.infer<typeof DeltaSchema> | undefined;
        text: string[];
        thinking: string[];
      }
    | undefined;
  private pending = new Map<number, ConversationItem>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private unknownTypes = new Set<string>();
  constructor(
    private readonly connectionGeneration: string,
    private readonly emit: (event: ConversationEvent) => void,
    private readonly budget = 8 * 1024 * 1024,
  ) {}
  accept(frame: NativeFrame): void {
    // Lifecycle and tool/subagent events are ordering barriers for token batches.
    if (frame.type !== NativeFrameTypes.messageUpdate) this.flush();
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
      const thinking = role === "assistant" ? thinkingOf(message.content) : "";
      const prior = existing == null ? undefined : this.items.get(existing);
      const timestamp =
        nativeMessageTime(message.timestamp) ?? prior?.timestamp;
      const continuationOf = prior?.continuationOf ?? this.interrupted;
      const identity = ReadingIdentitySchema.safeParse(message);
      if (identity.success && identity.data.dPiIdentityUnknown) this.gap = true;
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
        ...(thinking ? { thinking } : {}),
        state:
          role === "tool" &&
          state === "complete" &&
          prior?.tool?.backgroundState
            ? prior.tool.backgroundState === "running"
              ? "streaming"
              : prior.tool.backgroundState === "failed"
                ? "failed"
                : "complete"
            : state,
        ...(prior?.truncated && prior.tool?.truncated
          ? { truncated: true }
          : {}),
        ...(timestamp !== undefined ? { timestamp } : {}),
        ...(identity.success && identity.data.dPiRecordId
          ? { nativeRecordId: identity.data.dPiRecordId }
          : {}),
        ...(identity.success && identity.data.dPiRestored !== undefined
          ? { restored: identity.data.dPiRestored }
          : {}),
        ...(message.errorMessage
          ? { detail: message.errorMessage.slice(0, 4096) }
          : {}),
        ...(role === "assistant" && continuationOf !== null
          ? { continuationOf }
          : {}),
        ...(prior?.tool
          ? {
              tool: {
                ...prior.tool,
                lifecycle:
                  state === "failed" || state === "aborted"
                    ? "failed"
                    : "completed",
                observed: prior.tool.observed.includes("message-end")
                  ? prior.tool.observed
                  : [...prior.tool.observed, "message-end"],
              },
            }
          : {}),
        label:
          role === "tool"
            ? (prior?.label ?? {
                kind: "message",
                value: uiMessage("conversation.toolResult"),
              })
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
    if (frame.type === NativeFrameTypes.messageUpdate) {
      const delta = DeltaSchema.safeParse(frame.assistantMessageEvent);
      if (!delta.success && frame.message === undefined) return;
      const id = this.active ?? this.nextId++;
      this.active = id;
      this.stream ??= {
        id,
        snapshot: undefined,
        snapshotDelta: undefined,
        text: [],
        thinking: [],
      };
      // Keep only the latest authoritative message. Parse/extract it at flush,
      // then append only delta-only frames that followed that snapshot.
      if (
        typeof frame.message === "object" &&
        frame.message !== null &&
        Object.hasOwn(frame.message, "content")
      ) {
        this.stream.snapshot = frame.message;
        this.stream.snapshotDelta = delta.success ? delta.data : undefined;
        this.stream.text = [];
        this.stream.thinking = [];
      } else if (delta.success && delta.data.type === "text_delta") {
        this.stream.text.push(delta.data.delta);
      } else if (delta.success) {
        this.stream.thinking.push(delta.data.delta);
      }
      if (!this.timer) this.timer = setTimeout(() => this.flush(), 32);
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
        NativeFrameTypes.toolExecutionUpdate,
        NativeFrameTypes.toolExecutionEnd,
      )
    ) {
      const identity = z
        .object({
          toolCallId: z.string().min(1).max(512),
          toolName: z.string(),
        })
        .safeParse(frame);
      if (!identity.success) {
        this.gap = true;
        return;
      }
      const { toolCallId, toolName } = identity.data;
      const id = this.tools.get(toolCallId) ?? this.nextId++;
      this.tools.set(toolCallId, id);
      this.toolOwners.set(id, toolCallId);
      const prior = this.items.get(id);
      const stage =
        frame.type === NativeFrameTypes.toolExecutionStart
          ? "start"
          : frame.type === NativeFrameTypes.toolExecutionUpdate
            ? "update"
            : "end";
      const args =
        stage !== "end" && frame.args !== undefined
          ? toolPayload(frame.args)
          : prior?.tool?.arguments;
      const progress =
        stage === "update"
          ? toolPayload(frame.partialResult)
          : prior?.tool?.progress;
      const result =
        stage === "end" ? toolPayload(frame.result) : prior?.tool?.result;
      const observed: ToolExecutionObservation["observed"] = [
        ...(prior?.tool?.observed ?? []),
      ];
      if (!observed.includes(stage)) observed.push(stage);
      const truncated = Boolean(
        prior?.tool?.truncated ||
          args?.truncated ||
          progress?.truncated ||
          result?.truncated,
      );
      const payload =
        stage === "end"
          ? frame.result
          : stage === "update"
            ? frame.partialResult
            : undefined;
      const content = z.object({ content: z.unknown() }).safeParse(payload);
      const failed = stage === "end" && frame.isError === true;
      const background = BackgroundStateSchema.safeParse(payload);
      const backgroundState = background.success
        ? background.data.details.async.state
        : prior?.tool?.backgroundState;
      const lifecycle =
        stage === "end"
          ? failed
            ? "failed"
            : "completed"
          : (prior?.tool?.lifecycle ?? "running");
      const tool: ToolExecutionObservation = {
        toolCallId,
        name: toolName.slice(0, 120),
        lifecycle,
        ...(backgroundState ? { backgroundState } : {}),
        observed,
        coverage:
          !observed.includes("start") || truncated ? "partial" : "observed",
        truncated,
        ...(args ? { arguments: args } : {}),
        ...(progress ? { progress } : {}),
        ...(result ? { result } : {}),
      };
      this.put({
        ...prior,
        id,
        role: "tool",
        tool,
        label: { kind: "literal", text: tool.name },
        state:
          lifecycle === "failed" || backgroundState === "failed"
            ? "failed"
            : lifecycle === "running" || backgroundState === "running"
              ? "streaming"
              : "complete",
        text: content.success
          ? textOf(content.data.content)
          : (prior?.text ?? ""),
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
  private evict(id: number): void {
    this.items.delete(id);
    this.pending.delete(id);
    this.bytes -= this.sizes.get(id) ?? 0;
    this.sizes.delete(id);
    this.subagents.evict(id);
    const owner = this.toolOwners.get(id);
    if (owner !== undefined) this.tools.delete(owner);
    this.toolOwners.delete(id);
  }
  private put(item: ConversationItem): void {
    if (this.budget < 1024) throw Error("Projection budget too small");
    const sizeOf = (value: ConversationItem) =>
      draftByteLength(JSON.stringify(value)) + 1;
    let size = sizeOf(item);
    if (size + 1 > this.budget) {
      this.gap = true;
      this.coveragePending = true;
      item = { ...item, truncated: true };
      // Budget metadata as well as visible text. Preserve identities; never
      // shorten them into a different native record or tool call.
      if (item.tool) {
        item.tool = { ...item.tool, coverage: "partial", truncated: true };
        delete item.tool.arguments;
        delete item.tool.progress;
        delete item.tool.result;
      }
      if (item.subagent)
        item.subagent = {
          ...item.subagent,
          task: "",
          description: "",
          currentTool: "",
          model: "",
          coverage: "partial",
          reason: "truncated",
        };
      if (item.detail) item.detail = item.detail.slice(0, 120);
      const text = item.text;
      const thinking = item.thinking ?? "";
      const total = text.length + thinking.length;
      const candidate = (limit: number): ConversationItem => {
        const textLimit = total ? Math.floor((limit * text.length) / total) : 0;
        return {
          ...item,
          text: text.slice(0, textLimit),
          ...(item.thinking !== undefined
            ? { thinking: thinking.slice(0, limit - textLimit) }
            : {}),
        };
      };
      let low = 0;
      let high = total;
      while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (sizeOf(candidate(middle)) + 1 <= this.budget) low = middle;
        else high = middle - 1;
      }
      item = candidate(low);
      size = sizeOf(item);
      if (size + 1 > this.budget) {
        this.evict(item.id);
        return;
      }
    }
    this.bytes += size - (this.sizes.get(item.id) ?? 0);
    this.sizes.set(item.id, size);
    this.items.set(item.id, item);
    while (this.bytes > this.budget || this.items.size > 1000) {
      const id = this.items.keys().next().value;
      if (id === undefined) break;
      this.evict(id);
      this.gap = true;
      this.coveragePending = true;
    }
    if (this.items.has(item.id)) this.pending.set(item.id, item);
    if (!this.timer) this.timer = setTimeout(() => this.flush(), 32);
  }
  private materializeStream(): void {
    const stream = this.stream;
    if (!stream) return;
    this.stream = undefined;
    const prior = this.items.get(stream.id);
    const snapshot = AssistantSnapshotSchema.safeParse(stream.snapshot);
    if (!snapshot.success && stream.snapshotDelta) {
      if (stream.snapshotDelta.type === "text_delta")
        stream.text.unshift(stream.snapshotDelta.delta);
      else stream.thinking.unshift(stream.snapshotDelta.delta);
    }
    this.put({
      ...prior,
      id: stream.id,
      role: "assistant",
      label: { kind: "literal", text: "OMP" },
      state: "streaming",
      text:
        (snapshot.success
          ? textOf(snapshot.data.content)
          : (prior?.text ?? "")) + stream.text.join(""),
      thinking:
        (snapshot.success
          ? thinkingOf(snapshot.data.content)
          : (prior?.thinking ?? "")) + stream.thinking.join(""),
    });
  }
  flush(): void {
    this.materializeStream();
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.pending.size === 0 && this.coveragePending) {
      this.emit({
        kind: "snapshot",
        connectionGeneration: this.connectionGeneration,
        seq: ++this.seq,
        items: Array.from(this.items.values(), (item) => ({ ...item })),
        gap: this.gap,
      });
    }
    for (const item of this.pending.values())
      this.emit({
        kind: "update",
        connectionGeneration: this.connectionGeneration,
        seq: ++this.seq,
        item,
        droppedBefore: this.items.keys().next().value ?? 0,
        gap: this.gap,
      });
    this.pending.clear();
    this.coveragePending = false;
  }
  snapshot(): ConversationSnapshot {
    this.flush();
    return {
      kind: "snapshot",
      connectionGeneration: this.connectionGeneration,
      seq: this.seq,
      items: Array.from(this.items.values(), (item) => ({ ...item })),
      gap: this.gap,
    };
  }
  dispose(): void {
    clearTimeout(this.timer);
    this.stream = undefined;
    this.pending.clear();
    this.coveragePending = false;
  }
}

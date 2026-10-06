import { z } from "zod";
import {
  isKnownNativeFrameType,
  type NativeFrame,
  NativeSubagentEventSchema,
  NativeSubagentLifecycleSchema,
  NativeSubagentProgressSchema,
  NativeSubagentsResultSchema,
  nativeSubagentResultText,
} from "../../../platform/omp/protocol/public";
import type {
  ConversationItem,
  SubagentObservation,
} from "../contracts/public";

const terminal = (status: SubagentObservation["status"]) =>
  ["completed", "failed", "aborted"].includes(status);
interface Run {
  nativeId: string;
  parentToolCallId?: string | undefined;
  sessionFile?: string | undefined;
  item: ConversationItem;
}
const ownerKey = (value: {
  id: string;
  parentToolCallId?: string | undefined;
  sessionFile?: string | undefined;
}) =>
  JSON.stringify([
    value.id,
    value.parentToolCallId ?? null,
    value.sessionFile ?? null,
  ]);
export class SubagentProjection {
  private runs = new Map<string, Run>();
  private unavailable = false;
  private limited = false;
  constructor(
    private readonly allocate: () => number,
    private readonly put: (item: ConversationItem) => void,
  ) {}
  private save(key: string, run: Run): void {
    const bytes = new TextEncoder().encode(run.item.text);
    const truncated = bytes.length > 65536;
    if (truncated)
      run.item = {
        ...run.item,
        text: new TextDecoder().decode(bytes.subarray(0, 65536)),
        truncated: true,
        subagent: run.item.subagent
          ? { ...run.item.subagent, coverage: "partial", reason: "truncated" }
          : undefined,
      };
    this.runs.set(key, run);
    while (this.runs.size > 1000) {
      const first = this.runs.keys().next().value;
      if (first) this.runs.delete(first);
    }
    this.put(run.item);
  }
  retain(ids: ReadonlySet<number>): void {
    for (const [key, run] of this.runs)
      if (!ids.has(run.item.id)) this.runs.delete(key);
  }
  private seed(value: {
    id: string;
    parentToolCallId?: string | undefined;
    sessionFile?: string | undefined;
    agent: string;
    description?: string | undefined;
    task?: string | undefined;
    status: SubagentObservation["status"];
  }): Run {
    return {
      nativeId: value.id,
      parentToolCallId: value.parentToolCallId,
      sessionFile: value.sessionFile,
      item: {
        id: this.allocate(),
        role: "subagent",
        text: "",
        state: "streaming",
        label: { kind: "literal", text: value.agent.slice(0, 120) },
        subagent: {
          nativeId: value.id,
          ...(value.parentToolCallId
            ? { parentToolCallId: value.parentToolCallId }
            : {}),
          status: value.status,
          task: (value.task ?? "").slice(0, 2048),
          description: (value.description ?? "").slice(0, 512),
          currentTool: "",
          model: "",
          resultSource: "none",
          coverage: "observed",
        },
      },
    };
  }
  accept(frame: NativeFrame): boolean {
    if (frame.type === "d_pi_subagent_observation_unavailable") {
      if (!this.unavailable) {
        this.unavailable = true;
        this.put({
          id: this.allocate(),
          role: "notice",
          state: "complete",
          text: "",
          label: { kind: "literal", text: "OMP" },
          subagentNotice: "observation-unavailable",
        });
      }
      for (const [key, run] of this.runs) {
        if (run.item.subagent && !terminal(run.item.subagent.status)) {
          run.item = {
            ...run.item,
            subagent: {
              ...run.item.subagent,
              status: "unknown",
              coverage: "partial",
              reason: "observation-unavailable",
            },
          };
          this.save(key, run);
        }
      }
      return true;
    }
    if (frame.type === "subagent_lifecycle") {
      const parsed = NativeSubagentLifecycleSchema.safeParse(frame.payload);
      if (!parsed.success) return true;
      const value = parsed.data,
        key = ownerKey(value),
        previous = this.runs.get(key);
      if (
        previous?.item.subagent &&
        terminal(previous.item.subagent.status) &&
        value.status === "started"
      )
        return true;
      const run = previous ?? this.seed({ ...value, status: "unknown" });
      const meta = run.item.subagent;
      if (!meta) return true;
      run.item = {
        ...run.item,
        state:
          value.status === "started"
            ? "streaming"
            : value.status === "failed"
              ? "failed"
              : "complete",
        subagent: {
          ...meta,
          status: value.status === "started" ? "running" : value.status,
          description: (value.description ?? meta.description).slice(0, 512),
          ...(!previous && value.status !== "started"
            ? {
                coverage: "partial" as const,
                reason: "missing-lifecycle" as const,
              }
            : {}),
        },
      };
      this.save(key, run);
      return true;
    }
    if (frame.type === "subagent_progress") {
      const parsed = NativeSubagentProgressSchema.safeParse(frame.payload);
      if (!parsed.success) return true;
      const value = parsed.data,
        key = ownerKey({ ...value, id: value.progress.id }),
        run = this.runs.get(key);
      if (!run?.item.subagent || terminal(run.item.subagent.status))
        return true;
      const meta = run.item.subagent;
      run.item = {
        ...run.item,
        state: terminal(value.progress.status)
          ? value.progress.status === "failed"
            ? "failed"
            : "complete"
          : "streaming",
        text:
          meta.resultSource === "live"
            ? run.item.text
            : value.progress.recentOutput.join("\n"),
        subagent: {
          ...meta,
          status: value.progress.status,
          task: value.task.slice(0, 2048),
          description: (value.progress.description ?? meta.description).slice(
            0,
            512,
          ),
          currentTool: (value.progress.currentTool ?? "").slice(0, 120),
          model: (value.progress.resolvedModel ?? "").slice(0, 256),
          resultSource: meta.resultSource === "live" ? "live" : "progress",
        },
      };
      this.save(key, run);
      return true;
    }
    if (frame.type === "subagent_event") {
      const parsed = NativeSubagentEventSchema.safeParse(frame.payload);
      if (!parsed.success) return true;
      const matches = [...this.runs.entries()].filter(
        ([, run]) => run.nativeId === parsed.data.id,
      );
      if (matches.length !== 1) {
        for (const [key, run] of matches) {
          if (run.item.subagent) {
            run.item = {
              ...run.item,
              subagent: {
                ...run.item.subagent,
                coverage: "partial",
                reason: "identity-ambiguous",
              },
            };
            this.save(key, run);
          }
        }
        return true;
      }
      const match = matches[0];
      if (!match) return true;
      const [key, run] = match,
        event = parsed.data.event;
      if (!run.item.subagent || run.item.subagent.resultSource === "transcript")
        return true;
      if (event.type === "message_update") {
        const delta = z
          .object({ type: z.literal("text_delta"), delta: z.string() })
          .safeParse(event.assistantMessageEvent);
        if (delta.success && !terminal(run.item.subagent.status)) {
          run.item = {
            ...run.item,
            text: run.item.text + delta.data.delta,
            subagent: { ...run.item.subagent, resultSource: "live" },
          };
          this.save(key, run);
        }
        return true;
      }
      if (event.type === "message_start") {
        const message = z
          .object({ role: z.literal("assistant"), content: z.unknown() })
          .safeParse(event.message);
        if (message.success && !terminal(run.item.subagent.status)) {
          run.item = {
            ...run.item,
            text: nativeSubagentResultText(message.data.content),
            subagent: { ...run.item.subagent, resultSource: "live" },
          };
          this.save(key, run);
        }
        return true;
      }
      if (event.type !== "message_end") {
        if (!isKnownNativeFrameType(event.type)) {
          run.item = {
            ...run.item,
            subagent: {
              ...run.item.subagent,
              coverage: "partial",
              unhandledEvent: event.type.slice(0, 120),
            },
          };
          this.save(key, run);
        }
        return true;
      }
      const message = z
        .object({ role: z.literal("assistant"), content: z.unknown() })
        .safeParse(event.message);
      if (message.success && run.item.subagent) {
        run.item = {
          ...run.item,
          text: nativeSubagentResultText(message.data.content),
          subagent: { ...run.item.subagent, resultSource: "live" },
        };
        this.save(key, run);
      }
      return true;
    }
    if (frame.type === "response" && frame.command === "get_subagents") {
      const parsed = NativeSubagentsResultSchema.safeParse(frame.data);
      if (frame.success !== true || !parsed.success) return true;
      if (parsed.data.subagents.length > 128 && !this.limited) {
        this.limited = true;
        this.put({
          id: this.allocate(),
          role: "notice",
          text: "",
          state: "complete",
          label: { kind: "literal", text: "OMP" },
          subagentNotice: "observation-limit",
        });
      }
      for (const value of parsed.data.subagents.slice(0, 128)) {
        const key = ownerKey(value);
        if (!this.runs.has(key)) this.save(key, this.seed(value));
      }
      return true;
    }
    if (frame.type === "d_pi_subagent_transcript") {
      const parsed = z
        .object({
          id: z.string(),
          parentToolCallId: z.string().optional(),
          sessionFile: z.string().optional(),
          status: z.enum(["available", "unavailable"]),
          text: z.string().optional(),
          reset: z.boolean().optional(),
          reason: z
            .enum([
              "transcript-unavailable",
              "transcript-too-large",
              "transcript-empty",
            ])
            .optional(),
        })
        .safeParse(frame.payload);
      if (!parsed.success) return true;
      const value = parsed.data,
        key = ownerKey(value),
        run = this.runs.get(key);
      if (!run?.item.subagent) return true;
      run.item = {
        ...run.item,
        ...(value.status === "available" && value.text
          ? { text: value.text }
          : {}),
        subagent: {
          ...run.item.subagent,
          ...(value.status === "available" && value.text
            ? { resultSource: "transcript" as const }
            : {}),
          ...(value.status === "unavailable" || value.reset
            ? {
                coverage: "partial" as const,
                reason: value.reset
                  ? ("transcript-reset" as const)
                  : (value.reason ?? ("transcript-unavailable" as const)),
              }
            : {}),
        },
      };
      this.save(key, run);
      return true;
    }
    return false;
  }
}

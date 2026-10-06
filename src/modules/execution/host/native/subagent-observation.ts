import { stat } from "node:fs/promises";
import { z } from "zod";
import {
  type NativeFrame,
  type NativeSubagentLifecycle,
  NativeSubagentLifecycleSchema,
  NativeSubagentsResultSchema,
  NativeSubagentTranscriptSchema,
  nativeSubagentResultText,
} from "../../../../platform/omp/protocol/public";

const terminal = (value: NativeSubagentLifecycle) => value.status !== "started";
const sameOwner = (a: NativeSubagentLifecycle, b: NativeSubagentLifecycle) =>
  a.parentToolCallId === b.parentToolCallId && a.sessionFile === b.sessionFile;
// This adapter owns bounded read correlation only; native frames remain the
// execution truth and ConversationProjection owns the Renderer mirror.
export class NativeSubagentObservation {
  private disposed = false;
  private owners = new Map<string, NativeSubagentLifecycle>();
  private reads = new Set<string>();
  private queued: NativeSubagentLifecycle[] = [];
  private activeReads = 0;
  constructor(
    private readonly request: (
      type: string,
      payload?: Record<string, unknown>,
    ) => Promise<NativeFrame>,
    private readonly emit: (frame: NativeFrame) => void,
    private readonly sizeOf: (path: string) => Promise<{ size: number }> = stat,
  ) {}
  async start(): Promise<void> {
    try {
      const subscription = await this.request("set_subagent_subscription", {
        level: "events",
      });
      if (this.disposed) return;
      if (subscription.success !== true)
        throw Error("Subscription unavailable");
      const snapshot = await this.request("get_subagents");
      if (this.disposed) return;
      const parsed = NativeSubagentsResultSchema.safeParse(snapshot.data);
      if (snapshot.success !== true || !parsed.success)
        throw Error("Snapshot unavailable");
      for (const run of parsed.data.subagents.slice(0, 128)) {
        if (!this.owners.has(run.id))
          this.owners.set(run.id, { ...run, status: "started" });
      }
      this.emit({ ...snapshot, type: "response", command: "get_subagents" });
    } catch {
      if (!this.disposed)
        this.emit({ type: "d_pi_subagent_observation_unavailable" });
    }
  }
  accept(frame: NativeFrame): void {
    if (this.disposed || frame.type !== "subagent_lifecycle") return;
    const parsed = NativeSubagentLifecycleSchema.safeParse(frame.payload);
    if (!parsed.success) return;
    const value = parsed.data,
      previous = this.owners.get(value.id);
    if (
      previous &&
      !sameOwner(previous, value) &&
      !(terminal(previous) && !terminal(value))
    )
      return;
    if (
      previous &&
      sameOwner(previous, value) &&
      terminal(previous) &&
      !terminal(value)
    )
      return;
    this.owners.set(value.id, value);
    while (this.owners.size > 128) {
      const key = this.owners.keys().next().value;
      if (key) this.owners.delete(key);
    }
    const key = JSON.stringify([
      value.id,
      value.parentToolCallId,
      value.sessionFile,
    ]);
    if (terminal(value) && !this.reads.has(key)) {
      this.reads.add(key);
      while (this.reads.size > 256) {
        const first = this.reads.values().next().value;
        if (first) this.reads.delete(first);
      }
      if (this.queued.length >= 128) {
        this.unavailable(value, "transcript-unavailable");
        return;
      }
      this.queued.push(value);
      this.drain();
    }
  }
  private current(owner: NativeSubagentLifecycle): boolean {
    const current = this.owners.get(owner.id);
    return !this.disposed && !!current && sameOwner(current, owner);
  }
  private unavailable(
    owner: NativeSubagentLifecycle,
    reason:
      | "transcript-unavailable"
      | "transcript-too-large"
      | "transcript-empty",
  ): void {
    if (this.current(owner))
      this.emit({
        type: "d_pi_subagent_transcript",
        payload: {
          id: owner.id,
          parentToolCallId: owner.parentToolCallId,
          sessionFile: owner.sessionFile,
          status: "unavailable",
          reason,
        },
      });
  }
  private drain(): void {
    while (!this.disposed && this.activeReads < 2) {
      const owner = this.queued.shift();
      if (!owner) return;
      this.activeReads++;
      void this.read(owner).finally(() => {
        this.activeReads--;
        this.drain();
      });
    }
  }
  private async read(owner: NativeSubagentLifecycle): Promise<void> {
    try {
      if (!owner.sessionFile) {
        this.unavailable(owner, "transcript-unavailable");
        return;
      }
      const file = await this.sizeOf(owner.sessionFile);
      if (!this.current(owner)) return;
      // Official RPC reads to EOF. Reject oversized files before issuing that
      // read, preserving bounded live output as explicitly partial evidence.
      if (file.size > 1024 * 1024) {
        this.unavailable(owner, "transcript-too-large");
        return;
      }
      const response = await this.request("get_subagent_messages", {
        subagentId: owner.id,
      });
      if (!this.current(owner)) return;
      const parsed = NativeSubagentTranscriptSchema.safeParse(response.data);
      if (
        response.success !== true ||
        !parsed.success ||
        parsed.data.sessionFile !== owner.sessionFile
      ) {
        this.unavailable(owner, "transcript-unavailable");
        return;
      }
      let finalText = "";
      for (const item of parsed.data.messages) {
        const message = z
          .object({
            role: z.literal("assistant"),
            content: z.array(z.unknown()),
          })
          .safeParse(item);
        if (!message.success) continue;
        const text = nativeSubagentResultText(message.data.content);
        if (text) finalText = text;
      }
      if (!finalText) {
        this.unavailable(owner, "transcript-empty");
        return;
      }
      this.emit({
        type: "d_pi_subagent_transcript",
        payload: {
          id: owner.id,
          parentToolCallId: owner.parentToolCallId,
          sessionFile: owner.sessionFile,
          status: "available",
          text: finalText,
          reset: parsed.data.reset,
        },
      });
    } catch {
      this.unavailable(owner, "transcript-unavailable");
    }
  }
  dispose(): void {
    this.disposed = true;
    this.owners.clear();
    this.reads.clear();
    this.queued = [];
  }
}

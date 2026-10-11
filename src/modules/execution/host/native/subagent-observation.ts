import {
  type NativeFrame,
  type NativeSubagentLifecycle,
  NativeSubagentLifecycleSchema,
  NativeSubagentsResultSchema,
} from "../../../../platform/omp/protocol/public";

import type { NativeSubagentReadReply } from "./subagent-read";

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
  private readonly controllers = new Map<string, AbortController>();
  private readonly completions = new Set<Promise<void>>();
  constructor(
    private readonly request: (
      type: string,
      payload?: Record<string, unknown>,
    ) => Promise<NativeFrame>,
    private readonly emit: (frame: NativeFrame) => void,
    private readonly readTranscript: (
      owner: NativeSubagentLifecycle,
      signal: AbortSignal,
    ) => Promise<NativeSubagentReadReply>,
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
    if (previous && !sameOwner(previous, value))
      this.controllers.get(value.id)?.abort();
    this.owners.set(value.id, value);
    while (this.owners.size > 128) {
      const key = this.owners.keys().next().value;
      if (key) {
        this.controllers.get(key)?.abort();
        this.owners.delete(key);
      }
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
      if (!this.current(owner)) continue;
      this.activeReads++;
      const controller = new AbortController();
      this.controllers.set(owner.id, controller);
      const completion = this.read(owner, controller.signal).finally(() => {
        this.completions.delete(completion);
        if (this.controllers.get(owner.id) === controller)
          this.controllers.delete(owner.id);
        this.activeReads--;
        this.drain();
      });
      this.completions.add(completion);
    }
  }
  private async read(
    owner: NativeSubagentLifecycle,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const reply = await this.readTranscript(owner, signal);
      if (!this.current(owner) || signal.aborted) return;
      if (reply.status === "unavailable") {
        this.unavailable(owner, reply.reason);
        return;
      }
      this.emit({
        type: "d_pi_subagent_transcript",
        payload: {
          id: owner.id,
          parentToolCallId: owner.parentToolCallId,
          sessionFile: owner.sessionFile,
          status: "available",
          text: reply.text,
          truncated: reply.truncated,
        },
      });
    } catch {
      this.unavailable(owner, "transcript-unavailable");
    }
  }
  dispose(): Promise<void> {
    this.disposed = true;
    for (const controller of this.controllers.values()) controller.abort();
    this.owners.clear();
    this.reads.clear();
    this.queued = [];
    return Promise.allSettled([...this.completions]).then(() => {});
  }
}

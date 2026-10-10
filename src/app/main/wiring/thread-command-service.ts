import { randomUUID } from "node:crypto";
import {
  type NativeSessionBinding,
  type ThreadContext,
  ThreadContextSchema,
  type ThreadMutation,
} from "../../../modules/threads/contracts/public";
import { AppStorage } from "./app-storage";
export interface ThreadHistoryOperations {
  execute(
    kind: "fork" | "delete",
    thread: ThreadContext,
    binding: NativeSessionBinding,
    destinationId?: string,
    retry?: boolean,
  ): Promise<
    { kind: "deleted" } | { kind: "forked"; file: string; sessionId: string }
  >;
}
/** Shared command owner; presentation adapters never write repositories or native history. */
export class ThreadCommandService {
  private closing = false;
  private lane: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly store: AppStorage,
    private readonly history: ThreadHistoryOperations,
    private readonly idle: <T>(
      id: string,
      operation: () => Promise<T>,
    ) => Promise<T>,
  ) {}
  close(): Promise<void> {
    this.closing = true;
    return this.lane.then(
      () => {},
      () => {},
    );
  }
  execute(id: string, mutation: ThreadMutation): Promise<ThreadContext | null> {
    if (this.closing) return Promise.reject(Error("Application closing"));
    const next = this.lane.catch(() => {}).then(() => this.apply(id, mutation));
    this.lane = next;
    return next;
  }
  private async apply(
    id: string,
    mutation: ThreadMutation,
  ): Promise<ThreadContext | null> {
    const thread = this.store.threads.threadContext(id);
    if (mutation.kind === "rename") {
      this.store.threads.rename(id, mutation.title);
      return this.store.threads.threadContext(id);
    }
    if (mutation.kind === "complete") {
      this.store.threads.complete(id, mutation.value);
      return this.store.threads.threadContext(id);
    }
    return this.idle(id, async () => {
      if (
        this.store.submissions
          .list(id)
          .some(
            (r) =>
              r.state === "prepared" ||
              r.state === "dispatching" ||
              r.state === "unknown" ||
              (r.state === "acknowledged" &&
                (r.outcome === "unknown" || r.outcome === "unobserved")),
          )
      )
        throw Error("Unresolved submission");
      const binding = this.store.threads.nativeSessionBinding(id);
      if (mutation.kind === "delete") {
        const retry = this.store.threads.deletionPending(id);
        this.store.threads.beginDeletion(id);
        if (binding)
          await this.history.execute(
            "delete",
            thread,
            binding,
            undefined,
            retry,
          );
        this.store.threads.finishDeletion(id);
        return null;
      }
      if (!binding) throw Error("No saved native branch");
      const newId = randomUUID();
      // Persist destination identity before any native write, including a lost ACK.
      this.store.threads.beginFork(newId, id, binding);
      const result = await this.history.execute("fork", thread, binding, newId);
      if (result.kind !== "forked") throw Error("Invalid native fork");
      try {
        return this.store.threads.createFork(thread.directory, newId, id, {
          ...binding,
          threadId: newId,
          sessionFile: result.file,
          sessionId: result.sessionId,
          origin: undefined,
          historyRoot: undefined,
        });
      } catch (error) {
        // A failed App transaction cannot claim the new native branch was adopted.
        await this.history
          .execute(
            "delete",
            ThreadContextSchema.parse({ ...thread, threadId: newId }),
            {
              ...binding,
              threadId: newId,
              sessionFile: result.file,
              sessionId: result.sessionId,
              origin: undefined,
              historyRoot: undefined,
            },
          )
          .then(
            () => this.store.threads.forgetUnadoptedFork(newId),
            () => {},
          );
        throw error;
      }
    });
  }
}

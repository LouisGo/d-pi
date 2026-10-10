import { match } from "ts-pattern";
import { createStore } from "zustand/vanilla";
import type { SidebarChange } from "../../../modules/preferences/contracts/public";
import type {
  ThreadContext,
  ThreadMutation,
} from "../../../modules/threads/contracts/public";
import type { ThreadTransitionResult } from "./thread-transition";

interface ThreadCommandTarget {
  sidebar: { change: (change: SidebarChange) => Promise<void> };
  newThread: (
    threadId?: ThreadContext["threadId"],
  ) => Promise<ThreadTransitionResult>;
  selectThread: (
    threadId: ThreadContext["threadId"],
  ) => Promise<ThreadTransitionResult>;
  manageThread: (
    threadId: ThreadContext["threadId"],
    mutation: ThreadMutation,
  ) => Promise<ThreadTransitionResult>;
}
export type ThreadUiCommand =
  | { kind: "sidebar"; change: SidebarChange }
  | { kind: "new"; threadId?: ThreadContext["threadId"] }
  | { kind: "select"; threadId: ThreadContext["threadId"] }
  | {
      kind: "mutate";
      threadId: ThreadContext["threadId"];
      mutation: ThreadMutation;
    }
  | { kind: "request-rename"; thread: ThreadContext }
  | { kind: "request-delete"; thread: ThreadContext };
export type ThreadCommandPrompt = {
  kind: "rename" | "delete";
  thread: ThreadContext;
};
/** One application command facade for menus, quick actions, drag and future shortcuts. */
export class ThreadCommands {
  readonly stateStore = createStore<{
    prompt: ThreadCommandPrompt | null;
    pending: boolean;
    failed: boolean;
    success: { id: number; kind: "completed" | "reopened" } | null;
  }>(() => ({ prompt: null, pending: false, failed: false, success: null }));
  private disposed = false;
  private feedbackId = 0;
  constructor(private readonly model: ThreadCommandTarget) {}
  closePrompt(): void {
    if (!this.stateStore.getState().pending)
      this.stateStore.setState({ prompt: null });
  }
  dispose(): void {
    this.disposed = true;
  }
  dismissSuccess(id: number): void {
    if (!this.disposed && this.stateStore.getState().success?.id === id)
      this.stateStore.setState({ success: null });
  }
  async execute(
    command: ThreadUiCommand,
  ): Promise<ThreadTransitionResult | void> {
    if (this.disposed) return;
    if (
      command.kind === "request-rename" ||
      command.kind === "request-delete"
    ) {
      if (!this.stateStore.getState().pending)
        this.stateStore.setState({
          prompt: {
            kind: command.kind === "request-rename" ? "rename" : "delete",
            thread: command.thread,
          },
          failed: false,
        });
      return;
    }
    if (command.kind === "sidebar")
      return this.model.sidebar.change(command.change);
    if (this.stateStore.getState().pending) return;
    this.stateStore.setState({ pending: true, failed: false, success: null });
    try {
      const result = await match(command)
        .with({ kind: "new" }, ({ threadId }) => this.model.newThread(threadId))
        .with({ kind: "select" }, ({ threadId }) =>
          this.model.selectThread(threadId),
        )
        .with({ kind: "mutate" }, ({ threadId, mutation }) =>
          this.model.manageThread(threadId, mutation),
        )
        .exhaustive();
      if (!this.disposed)
        this.stateStore.setState({
          failed: result.kind !== "applied",
          ...(result.kind === "applied" ? { prompt: null } : {}),
          ...(result.kind === "applied" &&
          command.kind === "mutate" &&
          command.mutation.kind === "complete"
            ? {
                success: {
                  id: ++this.feedbackId,
                  kind: command.mutation.value
                    ? ("completed" as const)
                    : ("reopened" as const),
                },
              }
            : {}),
        });
      return result;
    } catch {
      if (!this.disposed) this.stateStore.setState({ failed: true });
    } finally {
      if (!this.disposed) this.stateStore.setState({ pending: false });
    }
  }
}

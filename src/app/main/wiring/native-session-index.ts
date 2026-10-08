import {
  listNativeSessionCatalog,
  type NativeSessionCatalogCursor,
} from "../../../modules/conversation/main/public";
import type { ThreadRepository } from "../../../modules/threads/main/public";

/** App-owned associations only; discovery never opens an execution session. */
export class NativeSessionIndex {
  private continuation: NativeSessionCatalogCursor | null = null;
  private cyclePartial = false;
  private pending: Promise<"ready" | "partial" | "unavailable"> | null = null;
  private last: {
    at: number;
    status: "ready" | "partial" | "unavailable";
  } | null = null;
  private source: { at: number; root: string | null } | null = null;
  private sourcePending: Promise<string | null> | null = null;
  constructor(
    private readonly threads: ThreadRepository,
    private readonly locateRoot: (traceId: string) => Promise<string | null>,
  ) {}
  sessionsRoot(traceId: string): Promise<string | null> {
    if (this.sourcePending) return this.sourcePending;
    if (this.source && Date.now() - this.source.at < 5000)
      return Promise.resolve(this.source.root);
    this.sourcePending = this.locateRoot(traceId)
      .then((root) => {
        this.source = { at: Date.now(), root };
        return root;
      })
      .finally(() => {
        this.sourcePending = null;
      });
    return this.sourcePending;
  }
  reconcile(
    traceId: string,
    force = false,
  ): Promise<"ready" | "partial" | "unavailable"> {
    if (this.pending) return this.pending;
    if (
      !force &&
      !this.continuation &&
      this.last &&
      Date.now() - this.last.at < 5000
    )
      return Promise.resolve(this.last.status);
    if (force) this.source = null;
    this.pending = this.discover(traceId)
      .then((status) => {
        this.last = { at: Date.now(), status };
        return status;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
  private async discover(
    traceId: string,
  ): Promise<"ready" | "partial" | "unavailable"> {
    try {
      const root = await this.sessionsRoot(traceId);
      if (!root) return "unavailable";
      const catalog = await listNativeSessionCatalog(root, this.continuation);
      // A missing official sessions directory is an empty initial catalog;
      // after an indexed history existed, the missing source stays unavailable.
      if (catalog.kind === "unavailable") {
        return catalog.reason === "missing" &&
          !this.threads.list().some((thread) => thread.origin === "cli")
          ? "ready"
          : "unavailable";
      }
      this.threads.reconcileNativeSessions(catalog.sessions);
      // Advance only after the page's associations commit successfully.
      if (!this.continuation || this.continuation.root !== catalog.root)
        this.cyclePartial = false;
      this.cyclePartial ||= catalog.degraded;
      this.continuation = catalog.next;
      return this.continuation || this.cyclePartial ? "partial" : "ready";
    } catch {
      return "unavailable";
    }
  }
}

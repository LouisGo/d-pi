import { createStore } from "zustand/vanilla";
import type {
  ConversationPort,
  HistoryBridge,
  HistoryCursor,
} from "../../../modules/conversation/contracts/public";
import type {
  ContextInsertIntent,
  ContextInsertResult,
} from "../../../modules/input/contracts/public";
import type { DraftController } from "../../../modules/input/core/public";
import {
  type FrozenContext,
  FrozenContextSchema,
  type SourceRef,
  sourceKey,
  type ToolDetail,
  type ToolDetailReply,
} from "../../../modules/resources/contracts/public";
import { requestReadOperation } from "../../../shared/read-operation";
import type {
  SourceTarget,
  ToolTarget,
  WorkspaceSourceTarget,
} from "./source-target";

export type { ToolTarget } from "./source-target";
export interface ToolSurface {
  id: string;
  target: ToolTarget;
  pinned: boolean;
  detail: ToolDetail | null;
  unavailable: string | null;
  selection: { detail: ToolDetail; start: number; end: number } | null;
  issue: "too-large" | "stale" | "unavailable" | "composing" | null;
}
type Destination = { key: string; controller: DraftController; title: string };
type ReturnIntent = { surfaceId: string; ticket: number; target: ToolTarget };
type State = {
  surfaces: readonly ToolSurface[];
  selected: string | null;
  revealToken: number;
  returning: ReturnIntent | null;
  returnIssue: "missing" | "blocked" | "limit" | null;
  workspaceNavigation: {
    ticket: number;
    target: WorkspaceSourceTarget;
    phase: "selecting" | "ready";
  } | null;
};
type Reader = {
  users: Set<string>;
  detail: ToolDetail | null;
  unavailable: string | null;
  release: () => void;
  durable: boolean;
  handoff: string | null;
  abortNative: () => void;
};
const keyOf = sourceKey;
const targetKey = (target: ToolTarget) =>
  JSON.stringify([keyOf(target.source), target.artifactKey ?? null]);
function matchesDetail(target: ToolTarget, detail: ToolDetail): boolean {
  if (!target.artifactKey) return keyOf(target.source) === keyOf(detail.source);
  const source = detail.source;
  return (
    source.kind === "native-artifact" &&
    source.threadId === target.source.threadId &&
    source.nativeSessionKey === target.source.nativeSessionKey &&
    source.artifactKey === target.artifactKey &&
    source.recordId ===
      (target.source.kind === "live-tool"
        ? target.nativeRecordId
        : target.source.recordId) &&
    (target.source.kind === "live-tool" ||
      source.recordRevision ===
        (target.source.kind === "native-artifact"
          ? target.source.recordRevision
          : target.source.revision))
  );
}

/** Window-only composition. Tool execution, native persistence and draft bodies have other owners. */
export class WindowWorkbench {
  private readonly store = createStore<State>(() => ({
    surfaces: [],
    selected: null,
    revealToken: 0,
    returning: null,
    returnIssue: null,
    workspaceNavigation: null,
  }));
  readonly stateStore: Pick<
    typeof this.store,
    "getState" | "getInitialState" | "subscribe"
  > = this.store;
  private readonly readers = new Map<string, Reader>();
  private readonly anchors = new Map<
    string,
    { locate: (rowId: string) => boolean }
  >();
  private readonly rows = new Map<
    string,
    {
      nativeSessionKey: string;
      resolve: (source: SourceRef) => string | undefined;
      load?: (() => Promise<boolean>) | undefined;
    }
  >();
  private navigation = 0;
  private pageTicket = 0;
  private pageCount = 0;
  private loadingTicket: number | null = null;
  private disposed = false;
  private locating = false;
  get locatingSource(): boolean {
    return this.locating;
  }
  constructor(
    private readonly ports: {
      conversation?: ConversationPort | undefined;
      history?: HistoryBridge | undefined;
      insert: (
        key: string,
        controller: DraftController,
        intent: ContextInsertIntent,
      ) => ContextInsertResult;
      select: (threadId: string, ticket: number) => Promise<boolean>;
      projectDirectory?: (threadId: string) => string | undefined;
    },
  ) {}
  private patch(id: string, fields: Partial<ToolSurface>) {
    this.store.setState((state) => ({
      surfaces: state.surfaces.map((surface) =>
        surface.id === id ? { ...surface, ...fields } : surface,
      ),
    }));
  }
  projectDirectory(threadId: string): string | undefined {
    return this.ports.projectDirectory?.(threadId);
  }
  async reveal(target: SourceTarget): Promise<boolean> {
    if (target.kind === "activity") return this.open(target.activity) !== null;
    if (target.kind === "artifact") return this.open(target.artifact) !== null;
    if (this.disposed) return false;
    this.cancelReturn();
    const ticket = this.navigation;
    const identity = target.kind === "file" ? target.file : target.diff;
    this.store.setState({
      workspaceNavigation: { ticket, target, phase: "selecting" },
    });
    let selected = false;
    try {
      selected = await this.ports.select(identity.threadId, ticket);
    } catch {
      selected = false;
    }
    if (!this.isNavigation(ticket)) return false;
    if (!selected) {
      this.completeWorkspaceNavigation(ticket);
      return false;
    }
    this.store.setState({
      workspaceNavigation: { ticket, target, phase: "ready" },
    });
    return true;
  }
  workspaceNavigationTicket(threadId: string): number | undefined {
    const intent = this.store.getState().workspaceNavigation;
    if (!intent || !this.isNavigation(intent.ticket)) return undefined;
    const identity =
      intent.target.kind === "file" ? intent.target.file : intent.target.diff;
    return identity.threadId === threadId ? intent.ticket : undefined;
  }
  completeWorkspaceNavigation(ticket: number): void {
    if (this.store.getState().workspaceNavigation?.ticket === ticket)
      this.store.setState({ workspaceNavigation: null });
  }
  open(target: ToolTarget): string | null {
    if (this.disposed) return null;
    this.cancelReturn();
    const same = this.store
      .getState()
      .surfaces.find(
        (surface) => targetKey(surface.target) === targetKey(target),
      );
    if (same) {
      this.select(same.id);
      return same.id;
    }
    const peek = this.store
      .getState()
      .surfaces.find((surface) => !surface.pinned);
    if (peek) this.close(peek.id);
    if (this.store.getState().surfaces.length >= 8) return null;
    const id = crypto.randomUUID();
    this.store.setState((state) => ({
      surfaces: [
        ...state.surfaces,
        {
          id,
          target,
          pinned: false,
          detail: null,
          unavailable: null,
          selection: null,
          issue: null,
        },
      ],
      selected: id,
      revealToken: state.revealToken + 1,
    }));
    const key = targetKey(target);
    let reader = this.readers.get(key);
    if (reader) {
      reader.users.add(id);
      this.patch(id, {
        detail: reader.detail,
        unavailable: reader.unavailable,
      });
      return id;
    }
    reader = {
      users: new Set([id]),
      detail: null,
      unavailable: null,
      release: () => {},
      durable: false,
      handoff: null,
      abortNative: () => {},
    };
    this.readers.set(key, reader);
    const current = reader;
    const nativeAbort = new AbortController();
    current.abortNative = () => nativeAbort.abort();
    const history = this.ports.history;
    const readNative = (cursor: HistoryCursor | null, recordId?: string) => {
      const request = history?.requestTool?.bind(history);
      const cancel = history?.cancelRead?.bind(history);
      if (request && cancel) {
        const command = {
          operationId: crypto.randomUUID(),
          traceId: id,
          threadId: target.source.threadId,
          source: target.source,
          cursor,
          readerId: id,
          ...(recordId ? { recordId } : {}),
          ...(target.artifactKey ? { artifactKey: target.artifactKey } : {}),
        };
        return requestReadOperation(
          { request: () => request(command), cancel },
          command,
          nativeAbort.signal,
        );
      }
      if (!history?.tool) throw Error("Missing historical reader");
      return history.tool(target.source, cursor, id, recordId);
    };
    const receive = (reply: ToolDetailReply) => {
      if (this.disposed || this.readers.get(key) !== current) return;
      if (reply.kind === "tool-detail" && !matchesDetail(target, reply.detail))
        return;
      if (current.durable) return;
      current.detail =
        reply.kind === "tool-detail" ? reply.detail : current.detail;
      current.unavailable =
        reply.kind === "tool-unavailable" ? reply.reason : null;
      for (const user of current.users)
        this.patch(user, {
          detail: current.detail,
          unavailable: current.unavailable,
        });
    };
    const timeout = setTimeout(() => {
      current.abortNative();
      receive({
        kind: "tool-unavailable",
        readerId: id,
        reason: "transport",
      });
    }, 5000);
    const accept = (reply: ToolDetailReply) => {
      clearTimeout(timeout);
      receive(reply);
      if (
        reply.kind === "tool-detail" &&
        target.source.kind === "live-tool" &&
        !target.artifactKey &&
        reply.detail.nativeRecordId &&
        this.ports.history?.tool &&
        current.handoff !== reply.detail.nativeRecordId
      ) {
        const recordId = reply.detail.nativeRecordId;
        current.handoff = recordId;
        void readNative(null, recordId).then(
          (persisted) => {
            if (
              this.disposed ||
              this.readers.get(key) !== current ||
              current.durable
            )
              return;
            receive(persisted);
            if (
              persisted.kind === "tool-detail" &&
              matchesDetail(target, persisted.detail)
            ) {
              current.durable = true;
              current.release();
              current.release = () => {};
            }
          },
          () =>
            receive({
              kind: "tool-unavailable",
              readerId: id,
              reason: "transport",
            }),
        );
      }
    };
    if (
      target.source.kind === "live-tool" &&
      !target.artifactKey &&
      this.ports.conversation?.watchTool
    ) {
      const release = this.ports.conversation.watchTool(target.source, accept);
      current.release = () => {
        clearTimeout(timeout);
        release();
      };
    } else if (
      (target.source.kind !== "live-tool" || target.artifactKey) &&
      (target.cursor || target.nativeRecordId) &&
      this.ports.history?.tool
    ) {
      void readNative(target.cursor ?? null, target.nativeRecordId).then(
        accept,
        () =>
          accept({
            kind: "tool-unavailable",
            readerId: id,
            reason: "transport",
          }),
      );
      current.release = () => clearTimeout(timeout);
    } else {
      clearTimeout(timeout);
      receive({ kind: "tool-unavailable", readerId: id, reason: "missing" });
    }
    return id;
  }
  openArtifact(id: string): string | null {
    const surface = this.store
      .getState()
      .surfaces.find((surface) => surface.id === id);
    const detail = surface?.detail;
    if (
      !surface ||
      !detail?.artifact ||
      detail.source.kind === "native-artifact" ||
      (detail.source.kind === "live-tool" && !detail.nativeRecordId)
    )
      return null;
    if (surface.selection) this.pin(id);
    return this.open({
      ...surface.target,
      artifactKey: detail.artifact.key,
      ...(detail.nativeRecordId
        ? { nativeRecordId: detail.nativeRecordId }
        : {}),
    });
  }
  select(id: string): void {
    this.cancelReturn();
    if (this.store.getState().surfaces.some((surface) => surface.id === id))
      this.store.setState((state) => ({
        selected: id,
        revealToken: state.revealToken + 1,
      }));
  }
  pin(id: string): void {
    this.patch(id, { pinned: true });
  }
  close(id: string): void {
    if (this.store.getState().returning?.surfaceId === id) this.cancelReturn();
    const surface = this.store
      .getState()
      .surfaces.find((item) => item.id === id);
    if (!surface) return;
    const key = targetKey(surface.target),
      reader = this.readers.get(key);
    reader?.users.delete(id);
    if (!reader?.users.size) {
      reader?.abortNative();
      reader?.release();
      this.readers.delete(key);
    }
    this.store.setState((state) => {
      const surfaces = state.surfaces.filter((item) => item.id !== id);
      return {
        surfaces,
        selected:
          state.selected === id
            ? (surfaces.at(-1)?.id ?? null)
            : state.selected,
      };
    });
  }
  selectRange(
    id: string,
    detail: ToolDetail,
    start: number,
    end: number,
  ): void {
    const surface = this.store
      .getState()
      .surfaces.find((item) => item.id === id);
    if (
      !surface ||
      !matchesDetail(surface.target, detail) ||
      start < 0 ||
      end > detail.text.length ||
      end <= start
    )
      return;
    this.patch(id, { selection: { detail, start, end }, issue: null });
  }
  resume(id: string): void {
    this.patch(id, { selection: null, issue: null });
  }
  reference(id: string, destination: Destination): ContextInsertResult {
    const surface = this.store
      .getState()
      .surfaces.find((item) => item.id === id);
    const detail = surface?.selection?.detail ?? surface?.detail;
    if (!surface || !detail) return { kind: "rejected", reason: "unavailable" };
    const range = surface.selection
      ? { start: surface.selection.start, end: surface.selection.end }
      : undefined;
    const frozen: FrozenContext = {
      source: detail.source,
      contentRevision: detail.contentRevision,
      title: surface.target.title,
      text: range ? detail.text.slice(range.start, range.end) : detail.text,
      ...(range ? { range } : {}),
      coverage: detail.coverage,
    };
    if (!FrozenContextSchema.safeParse(frozen).success) {
      this.patch(id, { issue: "too-large" });
      return { kind: "rejected", reason: "too-large" };
    }
    // Capture the exact destination before any downstream action. No lookup of
    // whichever Thread happens to be visible after an asynchronous operation.
    const intent: ContextInsertIntent = {
      operationId: crypto.randomUUID(),
      draftId: destination.controller.threadId,
      ...destination.controller.getEditorSnapshot(),
      context: frozen,
    };
    const result = this.ports.insert(
      destination.key,
      destination.controller,
      intent,
    );
    this.patch(id, {
      issue: result.kind === "rejected" ? result.reason : null,
    });
    return result;
  }
  cancelReturn(): void {
    this.navigation++;
    this.store.setState({ returning: null, workspaceNavigation: null });
  }
  isNavigation(ticket: number): boolean {
    return !this.disposed && ticket === this.navigation;
  }
  async returnToSource(id: string): Promise<void> {
    const surface = this.store
      .getState()
      .surfaces.find((item) => item.id === id);
    if (!surface || this.disposed) return;
    const ticket = ++this.navigation;
    this.store.setState({
      returning: { surfaceId: id, target: surface.target, ticket },
      returnIssue: null,
      workspaceNavigation: null,
    });
    const selected = await this.ports.select(
      surface.target.source.threadId,
      ticket,
    );
    if (!this.isNavigation(ticket)) return;
    if (!selected) {
      this.store.setState({ returning: null, returnIssue: "blocked" });
      return;
    }
    this.locate();
  }
  registerAnchor(
    threadId: string,
    locate: (rowId: string) => boolean,
  ): () => void {
    const anchor = { locate };
    this.anchors.set(threadId, anchor);
    queueMicrotask(() => this.locate());
    return () => {
      if (this.anchors.get(threadId) === anchor) this.anchors.delete(threadId);
    };
  }
  registerRows(
    threadId: string,
    nativeSessionKey: string,
    resolve: (source: SourceRef) => string | undefined,
    load?: (() => Promise<boolean>) | undefined,
  ): () => void {
    const rows = { nativeSessionKey, resolve, load };
    this.rows.set(threadId, rows);
    queueMicrotask(() => this.locate());
    return () => {
      if (this.rows.get(threadId) === rows) this.rows.delete(threadId);
    };
  }
  private locate(): void {
    const intent = this.store.getState().returning;
    if (!intent || !this.isNavigation(intent.ticket)) return;
    const threadId = intent.target.source.threadId;
    const rows = this.rows.get(threadId),
      anchor = this.anchors.get(threadId);
    if (!anchor || !rows) return; // mounting/query arrival will reattempt.
    if (rows.nativeSessionKey !== intent.target.source.nativeSessionKey) {
      this.store.setState({ returning: null, returnIssue: "missing" });
      return;
    }
    const row = rows.resolve(intent.target.source);
    this.locating = true;
    try {
      if (row && anchor.locate(row))
        this.store.setState({ returning: null, returnIssue: null });
      else {
        this.store.setState({ returnIssue: "missing" });
        if (!row && rows.load && this.loadingTicket !== intent.ticket) {
          if (this.pageTicket !== intent.ticket) {
            this.pageTicket = intent.ticket;
            this.pageCount = 0;
          }
          if (this.pageCount >= 16) {
            this.store.setState({ returning: null, returnIssue: "limit" });
            return;
          }
          this.pageCount++;
          this.loadingTicket = intent.ticket;
          void rows
            .load()
            .then(
              (loaded) => {
                if (!this.isNavigation(intent.ticket)) return;
                if (!loaded)
                  this.store.setState({
                    returning: null,
                    returnIssue: "missing",
                  });
              },
              () => {
                if (this.isNavigation(intent.ticket))
                  this.store.setState({
                    returning: null,
                    returnIssue: "missing",
                  });
              },
            )
            .finally(() => {
              if (this.loadingTicket === intent.ticket)
                this.loadingTicket = null;
              if (
                this.isNavigation(intent.ticket) &&
                this.rows.get(threadId) !== rows
              )
                this.locate();
            });
        }
      }
    } finally {
      this.locating = false;
    }
  }
  dispose(): void {
    this.disposed = true;
    this.cancelReturn();
    for (const reader of this.readers.values()) {
      reader.abortNative();
      reader.release();
    }
    this.readers.clear();
    this.rows.clear();
    this.anchors.clear();
    this.store.setState({ surfaces: [], selected: null });
  }
}

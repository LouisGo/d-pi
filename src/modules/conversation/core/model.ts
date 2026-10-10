import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StateCreator } from "zustand/vanilla";
import type {
  ConversationItem,
  ConversationPort,
  ConversationSnapshot,
} from "../contracts/public";
import { ItemIndex } from "./item-index";

export interface ConversationState {
  view: ConversationSnapshot | null;
  itemIds: readonly number[];
  itemsById: Pick<ReadonlyMap<number, ConversationItem>, "get">;
  nativeIdentities: readonly (string | number)[];
  messageCount: number;
  truncatedCount: number;
  bodyRevision: number;
  threadId: string | null;
  epoch: number;
  resyncing: boolean;
  resyncExhausted: boolean;
}

const initial: StateCreator<
  ConversationState,
  [],
  [["zustand/subscribeWithSelector", never]]
> = () => ({
  view: null,
  itemIds: [],
  itemsById: new ItemIndex(),
  nativeIdentities: [],
  messageCount: 0,
  truncatedCount: 0,
  bodyRevision: 0,
  threadId: null,
  epoch: 0,
  resyncing: false,
  resyncExhausted: false,
});

const createConversationStore = () =>
  createStore<ConversationState>()(subscribeWithSelector(initial));
export type ConversationStore = ReturnType<typeof createConversationStore>;
/** Read-only face of the store, kept for the React binding and for tests. */
export type ConversationStateStore = Pick<
  ConversationStore,
  "getState" | "getInitialState" | "subscribe"
>;

export class ConversationModel {
  private readonly store: ConversationStore = createConversationStore();
  readonly stateStore: ConversationStateStore = this.store;
  private remove: (() => void) | null = null;
  private disposed = false;
  private recoveryAttempts = 0;
  private index = new ItemIndex();
  constructor(private readonly port: ConversationPort) {}
  getSnapshot = (): ConversationSnapshot | null => this.store.getState().view;
  subscribe = (listener: () => void): (() => void) =>
    this.store.subscribe(
      (state) => state.view,
      () => listener(),
    );
  /**
   * Fine grained subscription for one projection of the reading state, e.g. a
   * single message. Plain `subscribe` still fires for every view change.
   */
  subscribeTo<Selection>(
    selector: (state: ConversationState) => Selection,
    listener: () => void,
  ): () => void {
    return this.store.subscribe(selector, () => listener());
  }
  private publishView(view: ConversationSnapshot): void {
    const previous = this.store.getState();
    const nextIds = view.items.map((item) => item.id);
    const itemIds =
      previous.itemIds.length === nextIds.length &&
      nextIds.every((id, index) => id === previous.itemIds[index])
        ? previous.itemIds
        : nextIds;
    this.index = new ItemIndex();
    let changedBody = false;
    let messageCount = 0;
    let truncatedCount = 0;
    for (const item of view.items) {
      this.index = this.index.with(item);
      changedBody ||= bodyChanged(item, previous.itemsById.get(item.id));
      messageCount += isMessage(item) ? 1 : 0;
      truncatedCount += item.truncated ? 1 : 0;
    }
    const identities = view.items.map((item) => item.nativeRecordId ?? item.id);
    const nativeIdentities =
      identities.length === previous.nativeIdentities.length &&
      identities.every((id, index) => id === previous.nativeIdentities[index])
        ? previous.nativeIdentities
        : identities;
    this.store.setState({
      view,
      itemIds,
      itemsById: this.index,
      nativeIdentities,
      messageCount,
      truncatedCount,
      bodyRevision: previous.bodyRevision + (changedBody ? 1 : 0),
    });
  }
  connect(threadId: string): void {
    this.recoveryAttempts = 0;
    this.connectInternal(threadId);
  }
  private connectInternal(threadId: string): void {
    if (this.disposed) return;
    this.remove?.();
    this.remove = null;
    const previous = this.store.getState();
    const epoch = previous.epoch + 1;
    let synchronized = false;
    this.store.setState({
      threadId,
      epoch,
      resyncing: false,
      resyncExhausted: false,
      ...(previous.threadId !== threadId
        ? {
            view: null,
            itemIds: [],
            itemsById: (this.index = new ItemIndex()),
            nativeIdentities: [],
            messageCount: 0,
            truncatedCount: 0,
          }
        : {}),
    });
    this.remove = this.port.connect(threadId, (event) => {
      if (epoch !== this.store.getState().epoch) return;
      if (event.kind === "snapshot") {
        const current = this.store.getState().view;
        if (
          synchronized &&
          current?.connectionGeneration === event.connectionGeneration &&
          event.seq < current.seq
        )
          return;
        synchronized = true;
        this.publishView(event);
        this.store.setState({ resyncing: false });
        return;
      }
      const view = this.store.getState().view;
      if (
        !synchronized ||
        !view ||
        event.connectionGeneration !== view.connectionGeneration ||
        event.seq <= view.seq
      )
        return;
      if (event.seq !== view.seq + 1) {
        const previous = this.store.getState();
        this.store.setState({
          view: indexedSnapshot(
            view,
            previous.itemIds,
            this.index,
            view.seq,
            true,
          ),
        });
        if (this.recoveryAttempts >= 3) {
          this.store.setState({ resyncing: false, resyncExhausted: true });
          return;
        }
        if (!this.store.getState().resyncing) {
          this.recoveryAttempts++;
          this.store.setState({ resyncing: true });
          void Promise.resolve().then(() => {
            const current = this.store.getState();
            if (epoch === current.epoch && current.threadId)
              this.connectInternal(current.threadId);
          });
        }
        return;
      }
      this.recoveryAttempts = 0;
      const previous = this.store.getState();
      let itemIds = previous.itemIds;
      let nativeIdentities = previous.nativeIdentities;
      let messageCount = previous.messageCount;
      let truncatedCount = previous.truncatedCount;
      let removed = 0;
      while ((itemIds[removed] ?? Infinity) < event.droppedBefore) {
        const id = itemIds[removed];
        if (id === undefined) break;
        const dropped = this.index.get(id);
        messageCount -= dropped && isMessage(dropped) ? 1 : 0;
        truncatedCount -= dropped?.truncated ? 1 : 0;
        this.index = this.index.without(id);
        removed++;
      }
      if (removed) {
        itemIds = itemIds.slice(removed);
        nativeIdentities = nativeIdentities.slice(removed);
      }
      const prior = this.index.get(event.item.id);
      if (!prior) {
        itemIds = [...itemIds, event.item.id];
        nativeIdentities = [
          ...nativeIdentities,
          event.item.nativeRecordId ?? event.item.id,
        ];
      } else if (prior.nativeRecordId !== event.item.nativeRecordId) {
        const identities = [...nativeIdentities];
        identities[itemIds.indexOf(event.item.id)] =
          event.item.nativeRecordId ?? event.item.id;
        nativeIdentities = identities;
      }
      messageCount +=
        (isMessage(event.item) ? 1 : 0) - (prior && isMessage(prior) ? 1 : 0);
      truncatedCount +=
        (event.item.truncated ? 1 : 0) - (prior?.truncated ? 1 : 0);
      this.index = this.index.with(event.item);
      this.store.setState({
        view: indexedSnapshot(view, itemIds, this.index, event.seq, event.gap),
        itemIds,
        nativeIdentities,
        itemsById: this.index,
        messageCount,
        truncatedCount,
        bodyRevision:
          previous.bodyRevision + (bodyChanged(event.item, prior) ? 1 : 0),
      });
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.store.setState({ epoch: this.store.getState().epoch + 1 });
    this.remove?.();
    this.remove = null;
  }
}

function isMessage(item: ConversationItem): boolean {
  return item.role === "user" || item.role === "assistant";
}

function bodyChanged(
  item: ConversationItem,
  prior?: ConversationItem,
): boolean {
  return (
    !item.notice &&
    !item.subagentNotice &&
    item.text.length > 0 &&
    item.text !== prior?.text
  );
}

/** Full arrays are materialized only for an explicit snapshot consumer. */
function indexedSnapshot(
  view: ConversationSnapshot,
  ids: readonly number[],
  index: ItemIndex,
  seq: number,
  gap: boolean,
): ConversationSnapshot {
  let items: ConversationItem[] | undefined;
  return {
    kind: "snapshot",
    connectionGeneration: view.connectionGeneration,
    seq,
    gap,
    get items() {
      items ??= ids.flatMap((id) => {
        const item = index.get(id);
        return item ? [item] : [];
      });
      return items;
    },
  };
}

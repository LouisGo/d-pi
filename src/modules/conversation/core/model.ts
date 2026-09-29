import { subscribeWithSelector } from "zustand/middleware";
import { createStore, type StateCreator } from "zustand/vanilla";
import type {
  ConversationPort,
  ConversationSnapshot,
} from "../contracts/public";

export interface ConversationState {
  view: ConversationSnapshot | null;
  threadId: string | null;
  epoch: number;
  resyncing: boolean;
}

const initial: StateCreator<
  ConversationState,
  [],
  [["zustand/subscribeWithSelector", never]]
> = () => ({
  view: null,
  threadId: null,
  epoch: 0,
  resyncing: false,
});

const createConversationStore = () =>
  createStore<ConversationState>()(subscribeWithSelector(initial));
export type ConversationStore = ReturnType<typeof createConversationStore>;
export type ConversationStateStore = Pick<
  ConversationStore,
  "getState" | "getInitialState" | "subscribe"
>;

export class ConversationModel {
  private readonly store: ConversationStore = createConversationStore();
  readonly stateStore: ConversationStateStore = this.store;
  private remove: (() => void) | null = null;
  private disposed = false;
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
  connect(threadId: string): void {
    if (this.disposed) return;
    this.remove?.();
    this.remove = null;
    const epoch = this.store.getState().epoch + 1;
    let synchronized = false;
    this.store.setState({ threadId, epoch, resyncing: false });
    this.remove = this.port.connect(threadId, (event) => {
      if (epoch !== this.store.getState().epoch) return;
      if (event.kind === "snapshot") {
        synchronized = true;
        this.store.setState({ view: event, resyncing: false });
        return;
      }
      const view = this.store.getState().view;
      if (
        !synchronized ||
        !view ||
        event.generation !== view.generation ||
        event.seq <= view.seq
      )
        return;
      if (event.seq !== view.seq + 1) {
        this.store.setState({ view: { ...view, gap: true } });
        if (!this.store.getState().resyncing) {
          this.store.setState({ resyncing: true });
          void Promise.resolve().then(() => {
            const current = this.store.getState();
            if (epoch === current.epoch && current.threadId)
              this.connect(current.threadId);
          });
        }
        return;
      }
      const items = view.items.filter(
        (entry) => entry.id >= event.droppedBefore,
      );
      const index = items.findIndex((entry) => entry.id === event.item.id);
      if (index < 0) items.push(event.item);
      else items[index] = event.item;
      this.store.setState({
        view: { ...view, seq: event.seq, items, gap: event.gap },
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

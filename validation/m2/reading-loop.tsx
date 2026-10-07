import type {
  ConversationEvent,
  ConversationItem,
  ConversationSnapshot,
  HistoryPage,
} from "../../src/modules/conversation/contracts/public";
import { bridge, model, mountRenderingFixture } from "./rendering.js";

const states = new Map<string, ConversationSnapshot>();
const listeners = new Map<string, (event: ConversationEvent) => void>();
const raw = Array.from(
  { length: 36000 },
  (_, index) => "RAW " + index + ": synthetic reading text 中文🙂\n",
).join("");
const initial = (threadId: string): ConversationSnapshot => ({
  kind: "snapshot",
  connectionGeneration: crypto.randomUUID(),
  seq: 0,
  gap: false,
  items: [
    ...Array.from(
      { length: 24 },
      (_, i): ConversationItem => ({
        id: i + 1,
        role: "assistant",
        state: i === 0 ? "streaming" : "complete",
        label: { kind: "literal", text: "Synthetic row " + (i + 1) },
        text:
          i === 0
            ? "Stable paragraph **selected words**.\n\n" +
              String.fromCharCode(96).repeat(3) +
              "text\n" +
              "CODE LINE ".repeat(60) +
              "\n" +
              String.fromCharCode(96).repeat(3) +
              "\n\nGrowing tail"
            : "Thread " +
              threadId +
              ", row " +
              (i + 1) +
              ".\n\n" +
              "Read-only synthetic fixture. ".repeat(20),
      }),
    ),
    {
      id: 25,
      role: "assistant",
      state: "streaming",
      label: { kind: "literal", text: "Synthetic long body" },
      text: raw,
    },
  ],
});
bridge.conversation = {
  connect(threadId, receive) {
    let view = states.get(threadId);
    if (!view) {
      view = initial(threadId);
      states.set(threadId, view);
    }
    listeners.set(threadId, receive);
    receive(view);
    return () => {
      if (listeners.get(threadId) === receive) listeners.delete(threadId);
    };
  },
};
let historyReason: "missing" | "denied" | "changed" | null = null;
let reads = 0;
bridge.history = {
  projectList: async () => ({
    kind: "catalog",
    sessions: [
      {
        key: "a".repeat(64),
        title: "Synthetic native session",
        sessionId: "native-fixture",
        modifiedAt: 1,
      },
    ],
    partial: true,
  }),
  read: async () => ({ kind: "unavailable", reason: "missing" }),
  projectRead: async (threadId, _key, cursor): Promise<HistoryPage> => {
    reads++;
    if (historyReason) return { kind: "unavailable", reason: historyReason };
    return {
      kind: "page",
      source: "native-fixture-version-1",
      coverage: "append-order",
      incompleteTail: true,
      omitted: 2,
      entries: Array.from({ length: 24 }, (_, i) => ({
        id: "native-" + (cursor?.offset ?? 0) + "-" + i,
        parentId: null,
        role: "assistant",
        text:
          "Saved native page " +
          (cursor?.offset ?? 0) +
          ", row " +
          i +
          ". " +
          "Synthetic native history. ".repeat(25),
      })),
      next: cursor
        ? null
        : { threadId, source: "native-fixture-version-1", offset: 200 },
    };
  },
};
function active() {
  const state = model.getSnapshot();
  if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
    throw Error("No selected Thread");
  return state.threadSelection.thread.context.threadId;
}
function change(id: number, tail: string, complete = false) {
  const threadId = active();
  const view = states.get(threadId);
  if (!view) throw Error("No live fixture");
  const old = view.items.find((item) => item.id === id);
  if (!old) throw Error("No row");
  const item: ConversationItem = {
    ...old,
    text: old.text + tail,
    state: complete ? "complete" : old.state,
  };
  const next = {
    ...view,
    seq: view.seq + 1,
    items: view.items.map((old) => (old.id === id ? item : old)),
  };
  states.set(threadId, next);
  listeners.get(threadId)?.({
    kind: "update",
    connectionGeneration: next.connectionGeneration,
    seq: next.seq,
    droppedBefore: 0,
    gap: next.gap,
    item,
  });
}
Object.assign(window, {
  readingProbe: {
    active,
    append: (
      id = 25,
      tail = "\nAPPENDED OUTPUT\n" + "append line\n".repeat(500),
    ) => change(id, tail),
    complete: () => change(1, "\n\nFINAL_MARKDOWN_TAIL", true),
    gap: () => {
      const threadId = active(),
        view = states.get(threadId);
      if (!view) return;
      const next = { ...view, seq: view.seq + 1, gap: true };
      states.set(threadId, next);
      listeners.get(threadId)?.(next);
    },
    sameSnapshot: () => {
      const view = states.get(active());
      if (view) {
        const next = { ...view, seq: view.seq + 1 };
        states.set(active(), next);
        listeners.get(active())?.(next);
      }
    },
    generation: () => {
      const threadId = active(),
        view = initial(threadId);
      states.set(threadId, view);
      listeners.get(threadId)?.(view);
    },
    historyReason: (reason: typeof historyReason) => {
      historyReason = reason;
    },
    reads: () => reads,
    text: (id: number) =>
      states.get(active())?.items.find((item) => item.id === id)?.text,
    manyRows: () => {
      const threadId = active(),
        view = states.get(threadId);
      if (!view) return;
      const next = {
        ...view,
        seq: view.seq + 1,
        items: Array.from(
          { length: 1000 },
          (_, i): ConversationItem => ({
            id: i + 1,
            role: "assistant",
            state: "complete",
            label: { kind: "literal", text: "Synthetic item " + i },
            text: "Budget sample " + i + ", short text.",
          }),
        ),
      };
      states.set(threadId, next);
      listeners.get(threadId)?.(next);
    },
    unmount: () => {
      root.unmount();
    },
  },
});
const root = mountRenderingFixture();

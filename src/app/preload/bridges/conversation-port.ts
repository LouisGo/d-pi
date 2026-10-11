import type { IpcRenderer } from "electron";
import { z } from "zod";
import {
  applyConversationUpdate,
  ConversationEventSchema,
  type ConversationItem,
  type ConversationPort,
  type ConversationSnapshot,
} from "../../../modules/conversation/contracts/public";
import {
  type SourceRef,
  type ToolDetailPort,
  type ToolDetailReply,
  ToolDetailReplySchema,
} from "../../../modules/resources/contracts/public";
import { ThreadIdSchema } from "../../../shared/identity";

type Broker = {
  port: MessagePort | null;
  view: Omit<ConversationSnapshot, "items"> | null;
  items: Map<number, ConversationItem>;
  listeners: Set<Parameters<ConversationPort["connect"]>[1]>;
  readers: Map<
    string,
    { source: SourceRef; listener: (event: ToolDetailReply) => void }
  >;
};
const PortTargetSchema = z.strictObject({ threadId: ThreadIdSchema });
/** One physical port per Thread; timeline demand and resource readers have separate ownership. */
export function createConversationPort(
  ipc: IpcRenderer,
): ConversationPort & ToolDetailPort {
  const brokers = new Map<string, Broker>();
  const attach = (event: Electron.IpcRendererEvent, data: unknown) => {
    const target = PortTargetSchema.safeParse(data);
    if (!target.success) return;
    const broker = brokers.get(target.data.threadId);
    if (!broker) {
      event.ports[0]?.close();
      return;
    }
    broker.port?.close();
    broker.view = null;
    broker.items.clear();
    const port = event.ports[0] ?? null;
    broker.port = port;
    if (!port) return;
    port.onmessage = (message) => {
      if (broker.port !== port) return;
      const raw: unknown = message.data;
      if (!raw || typeof raw !== "object" || !("kind" in raw)) return;
      if (raw.kind === "tool-detail" || raw.kind === "tool-unavailable") {
        const detail = ToolDetailReplySchema.safeParse(raw);
        if (detail.success)
          broker.readers.get(detail.data.readerId)?.listener(detail.data);
        return;
      }
      if (!broker.listeners.size) return;
      const parsed = ConversationEventSchema.safeParse(raw);
      if (!parsed.success) return;
      const value = parsed.data;
      if (value.kind === "snapshot") {
        const { items, ...view } = value;
        broker.view = view;
        broker.items = new Map(items.map((item) => [item.id, item]));
      } else if (
        broker.view &&
        broker.view.connectionGeneration === value.connectionGeneration &&
        value.seq === broker.view.seq + 1
      ) {
        const item = applyConversationUpdate(
          broker.items.get(value.item.id),
          value,
        );
        broker.view = item
          ? { ...broker.view, seq: value.seq, gap: value.gap }
          : null;
        // Only evicted rows and this entity are touched, never a cumulative body array.
        for (const id of broker.items.keys()) {
          if (id >= value.droppedBefore) break;
          broker.items.delete(id);
        }
        if (item) broker.items.set(item.id, item);
      } else broker.view = null;
      for (const listener of [...broker.listeners]) listener(value);
    };
    port.start();
    port.postMessage({
      kind: "timeline-demand",
      active: broker.listeners.size > 0,
    });
    for (const [readerId, reader] of broker.readers)
      port.postMessage({ kind: "watch-tool", readerId, source: reader.source });
  };
  const acquire = (threadId: string): Broker => {
    const existing = brokers.get(threadId);
    if (existing) return existing;
    if (!brokers.size) ipc.on("runtime:port", attach);
    const broker: Broker = {
      port: null,
      view: null,
      items: new Map(),
      listeners: new Set(),
      readers: new Map(),
    };
    brokers.set(threadId, broker);
    ipc.send("runtime:connect", threadId);
    return broker;
  };
  const release = (threadId: string, broker: Broker) => {
    if (broker.listeners.size || broker.readers.size) return;
    broker.port?.close();
    broker.port = null;
    brokers.delete(threadId);
    if (!brokers.size) ipc.removeListener("runtime:port", attach);
  };
  return {
    connect(threadId, listener) {
      const broker = acquire(threadId);
      const active = broker.listeners.size > 0;
      broker.listeners.add(listener);
      if (active && broker.view)
        listener({ ...broker.view, items: [...broker.items.values()] });
      else broker.port?.postMessage({ kind: "timeline-demand", active: true });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        broker.listeners.delete(listener);
        if (!broker.listeners.size) {
          broker.view = null;
          broker.items.clear();
          broker.port?.postMessage({ kind: "timeline-demand", active: false });
        }
        release(threadId, broker);
      };
    },
    watchTool(source, listener) {
      const broker = acquire(source.threadId);
      const readerId = crypto.randomUUID();
      broker.readers.set(readerId, { source, listener });
      broker.port?.postMessage({ kind: "watch-tool", readerId, source });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        broker.port?.postMessage({ kind: "release-tool", readerId });
        broker.readers.delete(readerId);
        release(source.threadId, broker);
      };
    },
  };
}

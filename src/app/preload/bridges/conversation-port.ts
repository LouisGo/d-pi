import type { IpcRenderer } from "electron";
import {
  ConversationEventSchema,
  type ConversationPort,
  type ConversationSnapshot,
} from "../../../modules/conversation/contracts/public";
import {
  type SourceRef,
  type ToolDetailPort,
  type ToolDetailReply,
  ToolDetailReplySchema,
} from "../../../modules/resources/contracts/public";

type Broker = {
  port: MessagePort | null;
  view: ConversationSnapshot | null;
  listeners: Set<Parameters<ConversationPort["connect"]>[1]>;
  readers: Map<
    string,
    { source: SourceRef; listener: (event: ToolDetailReply) => void }
  >;
  detach(): void;
};
/** One physical port per Thread. Reading subscriptions share it with the timeline. */
export function createConversationPort(
  ipc: IpcRenderer,
): ConversationPort & ToolDetailPort {
  const brokers = new Map<string, Broker>();
  const acquire = (threadId: string): Broker => {
    const existing = brokers.get(threadId);
    if (existing) return existing;
    const broker: Broker = {
      port: null,
      view: null,
      listeners: new Set(),
      readers: new Map(),
      detach: () => ipc.removeListener("runtime:port", handler),
    };
    const handler = (event: Electron.IpcRendererEvent, data: unknown) => {
      if (
        !data ||
        typeof data !== "object" ||
        !("threadId" in data) ||
        data.threadId !== threadId
      )
        return;
      broker.port?.close();
      broker.port = event.ports[0] ?? null;
      const port = broker.port;
      if (!port) return;
      port.onmessage = (message) => {
        if (broker.port !== port) return;
        const detail = ToolDetailReplySchema.safeParse(message.data);
        if (detail.success) {
          broker.readers.get(detail.data.readerId)?.listener(detail.data);
          return;
        }
        const parsed = ConversationEventSchema.safeParse(message.data);
        if (!parsed.success) return;
        const value = parsed.data;
        if (value.kind === "snapshot") broker.view = value;
        else if (
          broker.view &&
          broker.view.connectionGeneration === value.connectionGeneration &&
          value.seq === broker.view.seq + 1
        ) {
          broker.view = {
            ...broker.view,
            seq: value.seq,
            gap: value.gap,
            items: [
              ...broker.view.items.filter(
                (item) =>
                  item.id >= value.droppedBefore && item.id !== value.item.id,
              ),
              value.item,
            ].sort((a, b) => a.id - b.id),
          };
        } else {
          broker.view = null;
          ipc.send("runtime:connect", threadId);
        }
        for (const listener of broker.listeners) listener(value);
      };
      port.start();
      for (const [readerId, reader] of broker.readers)
        port.postMessage({
          kind: "watch-tool",
          readerId,
          source: reader.source,
        });
    };
    brokers.set(threadId, broker);
    ipc.on("runtime:port", handler);
    ipc.send("runtime:connect", threadId);
    return broker;
  };
  const release = (threadId: string, broker: Broker) => {
    if (broker.listeners.size || broker.readers.size) return;
    broker.detach();
    broker.port?.close();
    broker.port = null;
    brokers.delete(threadId);
  };
  return {
    connect(threadId, listener) {
      const existed = brokers.has(threadId);
      const broker = acquire(threadId);
      broker.listeners.add(listener);
      if (existed) ipc.send("runtime:connect", threadId);
      if (broker.view) listener(broker.view);
      return () => {
        broker.listeners.delete(listener);
        release(threadId, broker);
      };
    },
    watchTool(source, listener) {
      const broker = acquire(source.threadId);
      const readerId = crypto.randomUUID();
      broker.readers.set(readerId, { source, listener });
      broker.port?.postMessage({ kind: "watch-tool", readerId, source });
      return () => {
        broker.port?.postMessage({ kind: "release-tool", readerId });
        broker.readers.delete(readerId);
        release(source.threadId, broker);
      };
    },
  };
}

import type { NativeFrame } from "../../../platform/omp/protocol/public";
import { ToolReadCommandSchema } from "../../resources/contracts/public";
import type { ConversationEvent } from "../contracts/public";
import { ConversationProjection } from "./projection";
import { ToolDetails, type ToolScope } from "./tool-details";

export interface ConversationHostPort {
  start(): void;
  close(): void;
  postMessage(event: unknown): void;
  on?(
    event: "message" | "close",
    listener: (event: { data: unknown }) => void,
  ): void;
}

export interface ConversationHost {
  start(connectionGeneration: string, threadId?: string): void;
  accept(frame: NativeFrame): void;
  attach(port?: ConversationHostPort, scope?: ToolScope): void;
  dispose(): void;
}

export function createConversationHost(): ConversationHost {
  let projection: ConversationProjection | null = null;
  let port: ConversationHostPort | null = null;
  let details: ToolDetails | null = null;
  let identity: ToolScope | undefined;
  const readers = new Set<string>();
  const releaseReaders = () => {
    for (const id of readers) details?.release(id);
    readers.clear();
  };

  const post = (event: ConversationEvent): void => {
    try {
      port?.postMessage(event);
    } catch {
      port?.close();
      port = null;
    }
  };

  return {
    start(connectionGeneration, threadId) {
      releaseReaders();
      details?.dispose();
      identity = undefined;
      details = threadId
        ? new ToolDetails({
            threadId,
            connectionGeneration,
            nativeSessionKey: "",
          })
        : null;
      projection?.dispose();
      projection = new ConversationProjection(connectionGeneration, post);
    },
    accept(frame) {
      details?.accept(frame);
      projection?.accept(frame);
    },
    attach(next, scope) {
      releaseReaders();
      if (scope) {
        identity = scope;
        details?.bind(scope);
      }
      port?.close();
      port = next ?? null;
      const attached = port;
      attached?.on?.("message", (message) => {
        if (port !== attached) return;
        const parsed = ToolReadCommandSchema.safeParse(message.data);
        if (!parsed.success) return;
        const command = parsed.data;
        if (command.kind === "release-tool") {
          details?.release(command.readerId);
          readers.delete(command.readerId);
        } else if (details) {
          readers.add(command.readerId);
          details.watch(command.readerId, command.source, (value) =>
            attached?.postMessage(value),
          );
        }
      });
      attached?.on?.("close", () => {
        if (port === attached) {
          releaseReaders();
          port = null;
        }
      });
      port?.start();
      if (!projection || !port) return;
      try {
        port.postMessage({
          ...projection.snapshot(),
          ...(identity ? { nativeSessionKey: identity.nativeSessionKey } : {}),
        });
      } catch {
        port.close();
        port = null;
      }
    },
    dispose() {
      releaseReaders();
      details?.dispose();
      details = null;
      projection?.dispose();
      projection = null;
      port?.close();
      port = null;
    },
  };
}

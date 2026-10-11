import type { NativeFrame } from "../../../platform/omp/protocol/public";
import { ToolReadCommandSchema } from "../../resources/contracts/public";
import {
  type ConversationEvent,
  ConversationReadCommandSchema,
} from "../contracts/public";
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
  hasReadingDemand(): boolean;
  dispose(): void;
}

export function createConversationHost(): ConversationHost {
  let projection: ConversationProjection | null = null;
  let port: ConversationHostPort | null = null;
  let details: ToolDetails | null = null;
  let identity: ToolScope | undefined;
  let timelineActive = false;
  const readers = new Set<string>();
  const releaseReaders = () => {
    for (const id of readers) details?.release(id);
    readers.clear();
  };

  const post = (event: ConversationEvent): void => {
    if (!timelineActive) return;
    try {
      port?.postMessage(event);
    } catch {
      port?.close();
      port = null;
    }
  };
  const snapshot = () => {
    if (projection)
      post({
        ...projection.snapshot(),
        ...(identity ? { nativeSessionKey: identity.nativeSessionKey } : {}),
      });
  };

  return {
    hasReadingDemand: () => timelineActive || readers.size > 0,
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
      timelineActive = false;
      const attached = port;
      attached?.on?.("message", (message) => {
        if (port !== attached) return;
        const demand = ConversationReadCommandSchema.safeParse(message.data);
        if (demand.success) {
          timelineActive = demand.data.active;
          if (timelineActive) snapshot();
          return;
        }
        const parsed = ToolReadCommandSchema.safeParse(message.data);
        if (!parsed.success) return;
        const command = parsed.data;
        if (command.kind === "release-tool") {
          details?.release(command.readerId);
          readers.delete(command.readerId);
        } else if (details) {
          if (
            details.watch(command.readerId, command.source, (value) =>
              attached?.postMessage(value),
            )
          )
            readers.add(command.readerId);
        }
      });
      attached?.on?.("close", () => {
        if (port === attached) {
          releaseReaders();
          timelineActive = false;
          port = null;
        }
      });
      port?.start();
    },
    dispose() {
      releaseReaders();
      details?.dispose();
      details = null;
      projection?.dispose();
      projection = null;
      port?.close();
      port = null;
      timelineActive = false;
    },
  };
}

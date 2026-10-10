import type { NativeFrame } from "../../../platform/omp/protocol/public";
import type { ConversationEvent } from "../contracts/public";
import { ConversationProjection } from "./projection";

export interface ConversationHostPort {
  start(): void;
  close(): void;
  postMessage(event: unknown): void;
}

export interface ConversationHost {
  start(connectionGeneration: string): void;
  accept(frame: NativeFrame): void;
  attach(port?: ConversationHostPort): void;
  dispose(): void;
}

export function createConversationHost(): ConversationHost {
  let projection: ConversationProjection | null = null;
  let port: ConversationHostPort | null = null;

  const post = (event: ConversationEvent): void => {
    try {
      port?.postMessage(event);
    } catch {
      port?.close();
      port = null;
    }
  };

  return {
    start(connectionGeneration) {
      projection?.dispose();
      projection = new ConversationProjection(connectionGeneration, post);
    },
    accept(frame) {
      projection?.accept(frame);
    },
    attach(next) {
      port?.close();
      port = next ?? null;
      port?.start();
      if (!projection || !port) return;
      try {
        port.postMessage(projection.snapshot());
      } catch {
        port.close();
        port = null;
      }
    },
    dispose() {
      projection?.dispose();
      projection = null;
      port?.close();
      port = null;
    },
  };
}

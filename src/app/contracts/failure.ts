import type { Failure } from "../../modules/input/contracts/public";
import {
  type PlainUiMessageCode,
  uiMessage,
} from "../../shared/messages/contracts";
import type { Reply } from "./desktop-bridge";

export function failure(
  traceId: string,
  code: Failure["code"],
  messageCode: PlainUiMessageCode,
  causeCode?: string,
): Extract<Reply, { kind: "failed" }> {
  return {
    kind: "failed",
    error: {
      errorId: globalThis.crypto.randomUUID(),
      traceId,
      code,
      category:
        code === "storage-unavailable"
          ? "storage"
          : code === "directory-unavailable"
            ? "permission"
            : "validation",
      observedAt: "main",
      reportedBy: "app",
      attribution: "unknown",
      handlingOwner: "draft",
      recovery:
        code === "revision-conflict" ? "reconcile_first" : "user_action",
      message: uiMessage(messageCode),
      ...(causeCode ? { causeCode } : {}),
    },
  };
}

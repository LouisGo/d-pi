import { queryOptions } from "@tanstack/react-query";
import type { ThreadId } from "../../../shared/identity";
import {
  type AnswerHistoryBridge,
  AnswerHistoryPageSchema,
} from "../contracts/public";

export class AnswerHistoryReadError extends Error {
  readonly operation = "runtime:answer-history";
  constructor(
    readonly traceId: string,
    cause: unknown,
  ) {
    super("Answer history sampling failed", { cause });
    this.name = "AnswerHistoryReadError";
  }
}
export function answerHistoryPageQuery(
  bridge: AnswerHistoryBridge,
  threadId: ThreadId | null,
  cursor: number | null,
) {
  return queryOptions({
    queryKey: ["answer-history", threadId, cursor] as const,
    networkMode: "always",
    gcTime: 0,
    retry: false,
    queryFn: async () => {
      if (!threadId) return null;
      const traceId = crypto.randomUUID();
      try {
        const page = AnswerHistoryPageSchema.parse(
          await bridge.request({ threadId, cursor, traceId }),
        );
        if (page.threadId !== threadId)
          throw Error("Answer history Thread mismatch");
        return page;
      } catch (cause) {
        throw new AnswerHistoryReadError(traceId, cause);
      }
    },
  });
}

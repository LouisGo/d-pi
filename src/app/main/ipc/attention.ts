import { randomUUID } from "node:crypto";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { match } from "ts-pattern";
import type { DiagnosticEvent } from "../../../platform/main/diagnostics/public";
import { type ThreadId, TraceIdSchema } from "../../../shared/identity";
import {
  AttentionCommandSchema,
  type AttentionReply,
} from "../../contracts/attention";
import type { ThreadAttention } from "../wiring/thread-attention";

type AttentionContext = {
  ipcMain: Pick<IpcMain, "handle">;
  sourceValid: (event: IpcMainInvokeEvent) => boolean;
  getSourceGeneration: () => number;
  getAttention: () => ThreadAttention | undefined;
  isKnownThread: (threadId: ThreadId) => boolean;
  getActiveThread: () => ThreadId | null;
  getWriterId: () => string;
  record: (event: DiagnosticEvent) => void;
};
export function registerAttentionIpc(context: AttentionContext): void {
  context.ipcMain.handle(
    "attention:request",
    async (event, raw: unknown): Promise<AttentionReply> => {
      if (!context.sourceValid(event)) throw Error("Invalid attention source");
      const parsed = AttentionCommandSchema.safeParse(raw);
      const fallback = TraceIdSchema.safeParse(
        typeof raw === "object" && raw !== null && "traceId" in raw
          ? raw.traceId
          : undefined,
      );
      const traceId = parsed.success
        ? parsed.data.traceId
        : fallback.success
          ? fallback.data
          : TraceIdSchema.parse(randomUUID());
      const identity = {
        traceId,
        requestId: randomUUID(),
        connectionId: context.getWriterId(),
        operation: `attention:${parsed.success ? parsed.data.kind : "invalid"}`,
      };
      const record = (
        stage: "received" | "completed" | "failed",
        code?: string,
      ) => {
        try {
          context.record({ ...identity, stage, ...(code ? { code } : {}) });
        } catch {
          /* Diagnostics do not control command success. */
        }
      };
      const fail = (
        code: "storage-unavailable" | "invalid-request" | "source-changed",
      ): AttentionReply => {
        record("failed", code);
        return { kind: "failed", traceId, code };
      };
      record("received");
      if (!parsed.success) return fail("invalid-request");
      const command = parsed.data;
      const generation = context.getSourceGeneration();
      const frame = event.senderFrame,
        url = frame?.url,
        processId = frame?.processId,
        routingId = frame?.routingId;
      try {
        const attention = await Promise.resolve(context.getAttention());
        if (
          generation !== context.getSourceGeneration() ||
          !context.sourceValid(event) ||
          frame !== event.senderFrame ||
          frame?.url !== url ||
          frame?.processId !== processId ||
          frame?.routingId !== routingId
        )
          return fail("source-changed");
        if (!attention) return fail("storage-unavailable");
        if (
          (command.kind === "visible" && command.threadId !== null) ||
          command.kind === "seen"
        ) {
          const id = command.threadId;
          if (
            id === null ||
            !context.isKnownThread(id) ||
            context.getActiveThread() !== id
          )
            return fail("invalid-request");
        }
        match(command)
          .with({ kind: "snapshot" }, () => {})
          .with({ kind: "preferences" }, (value) =>
            attention.setPreferences(value.value),
          )
          .with({ kind: "visible" }, (value) =>
            attention.visible(value.threadId),
          )
          .with({ kind: "seen" }, (value) =>
            attention.seen(value.threadId, value.eventId),
          )
          .with({ kind: "opened" }, (value) => attention.opened(value.id))
          .exhaustive();
        record("completed");
        return { kind: "snapshot", traceId, snapshot: attention.snapshot() };
      } catch {
        return fail("storage-unavailable");
      }
    },
  );
}

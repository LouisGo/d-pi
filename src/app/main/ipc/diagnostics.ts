import { randomUUID } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { DiagnosticEvent } from "../../../platform/main/diagnostics/public";
import { BUILD_INFO } from "../../../shared/build-info";
import {
  type DiagnosticFilter,
  type DiagnosticReply,
  DiagnosticRequestSchema,
  type DiagnosticSnapshot,
  DiagnosticSnapshotSchema,
} from "../../../shared/diagnostics";

type DiagnosticContext = {
  ipcMain: Pick<IpcMain, "handle">;
  sourceValid: (event: IpcMainInvokeEvent) => boolean;
  read: (filter: DiagnosticFilter) => Promise<DiagnosticSnapshot>;
  chooseDestination: () => Promise<string | null>;
  getSourceGeneration: () => number;
  getWriterId: () => string;
  record: (event: DiagnosticEvent) => void;
};

export function registerDiagnosticIpc(context: DiagnosticContext) {
  let busy = false;
  context.ipcMain.handle(
    "diagnostics:request",
    async (event, raw: unknown): Promise<DiagnosticReply> => {
      if (!context.sourceValid(event)) throw Error("Invalid diagnostic source");
      const request = DiagnosticRequestSchema.parse(raw);
      const { traceId, filter } = request;
      const generation = context.getSourceGeneration();
      const frame = event.senderFrame;
      const url = frame?.url;
      const processId = frame?.processId;
      const routingId = frame?.routingId;
      const current = () => {
        try {
          return (
            generation === context.getSourceGeneration() &&
            context.sourceValid(event) &&
            event.senderFrame === frame &&
            frame?.url === url &&
            frame?.processId === processId &&
            frame?.routingId === routingId
          );
        } catch {
          return false;
        }
      };
      if (busy) return { kind: "failed", traceId, reason: "busy" };
      busy = true;
      const started = performance.now();
      const identity = {
        traceId,
        requestId: randomUUID(),
        connectionId: context.getWriterId(),
        operation: `diagnostics:${request.kind}`,
      };
      const record = (
        stage: "received" | "completed" | "failed",
        code?: string,
      ) => {
        try {
          context.record({
            ...identity,
            stage,
            durationMs: performance.now() - started,
            ...(code ? { code } : {}),
          });
        } catch {
          /* Diagnostics do not change the operation result. */
        }
      };
      record("received");
      let temporary: string | null = null;
      try {
        // Disk snapshot only: do not wait for a possibly slow/failing writer.
        const snapshot = DiagnosticSnapshotSchema.parse(
          await context.read(filter),
        );
        if (!current()) {
          record("failed", "source-changed");
          return { kind: "failed", traceId, reason: "source-changed" };
        }
        if (request.kind === "query") {
          record("completed");
          return { kind: "snapshot", traceId, snapshot };
        }
        const path = await context.chooseDestination();
        if (!current()) {
          record("failed", "source-changed");
          return { kind: "failed", traceId, reason: "source-changed" };
        }
        if (!path) {
          record("completed", "cancelled");
          return { kind: "cancelled", traceId };
        }
        const report =
          JSON.stringify(
            {
              schemaVersion: 1,
              exportedAt: new Date().toISOString(),
              build: BUILD_INFO,
              runtime: {
                platform: process.platform,
                arch: process.arch,
                electron: process.versions.electron ?? null,
                node: process.versions.node,
              },
              attribution: "unknown",
              coverageNote:
                "Retained application metadata only; missing records do not prove an operation did not occur. No OMP content, native logs, paths or crash dumps are included.",
              snapshot,
            },
            null,
            2,
          ) + "\n";
        if (Buffer.byteLength(report) > 2 * 1024 * 1024)
          throw Error("Export budget exceeded");
        temporary = join(
          dirname(path),
          `.d-pi-diagnostics-${randomUUID()}.tmp`,
        );
        const file = await open(temporary, "wx", 0o600);
        try {
          await file.writeFile(report, "utf8");
        } finally {
          await file.close();
        }
        if (!current()) {
          record("failed", "source-changed");
          return { kind: "failed", traceId, reason: "source-changed" };
        }
        await rename(temporary, path);
        temporary = null;
        record("completed");
        return {
          kind: "exported",
          traceId,
          fileName: basename(path).slice(0, 256),
        };
      } catch {
        const reason =
          request.kind === "query" ? "read-unavailable" : "export-unavailable";
        record("failed", reason);
        return { kind: "failed", traceId, reason };
      } finally {
        if (temporary) await unlink(temporary).catch(() => {});
        busy = false;
      }
    },
  );
}

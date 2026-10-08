import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { RuntimeViewSchema } from "../../../modules/execution/contracts/public";
import { Diagnostics } from "../../../platform/main/diagnostics/public";
import { uiMessage } from "../../../shared/messages/contracts";
import { registerRuntimeRequestIpc } from "./execution";

it.each([
  "occupied",
  "owner-unknown",
  "shutdown-unconfirmed",
  "lease-unavailable",
] as const)(
  "persists the bounded %s recovery reason at the actual IPC diagnostic boundary with the request trace",
  async (reason) => {
    const directory = mkdtempSync(join(tmpdir(), "d-pi-recovery-ipc-"));
    const diagnostics = new Diagnostics(directory);
    const traceId = crypto.randomUUID();
    const threadId = crypto.randomUUID();
    const view = RuntimeViewSchema.parse({
      threadId,
      traceId,
      configuration: uiMessage("runtime.configDefault"),
      revision: 1,
      phase: "failed",
      trusted: true,
      busy: false,
      model: null,
      recoveryFailure: reason,
      message: uiMessage("runtime.recoveryOccupied"),
    });
    const handle = vi.fn<IpcMain["handle"]>();
    registerRuntimeRequestIpc({
      ipcMain: { handle },
      sourceValid: () => true,
      getRuntime: () => ({ execute: async () => view }),
      initializeStorage: () => {},
      getDiagnostics: () => diagnostics,
      runtimeFailure: (trace) => ({
        traceId: trace,
        code: "runtime-unavailable",
        category: "unknown",
        message: uiMessage("runtime.notReady"),
      }),
    });
    try {
      const handler = handle.mock.calls[0]?.[1];
      if (!handler) throw Error("Missing runtime request handler");
      await expect(
        handler({} as IpcMainInvokeEvent, { kind: "start", threadId, traceId }),
      ).resolves.toEqual({ kind: "view", view });
      await diagnostics.close();
      const records = readFileSync(join(directory, "main.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(records).toMatchObject([
        { operation: "runtime:start", traceId, stage: "received" },
        {
          operation: "runtime:start",
          traceId,
          stage: "failed",
          code: `recovery-${reason}`,
        },
      ]);
      expect(records[0].requestId).toBe(records[1].requestId);
      expect(JSON.stringify(records)).not.toContain(directory);
    } finally {
      await diagnostics.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { AppStorage } from "../wiring/app-storage";
import { registerAnswerHistoryIpc } from "./answer-history";

it("reads durable answers after storage reopening, validates source and Thread without launching a runtime", async () => {
  const root = mkdtempSync(join(tmpdir(), "dpi-answer-ipc-")),
    path = join(root, "app.sqlite");
  let store = AppStorage.open(path);
  const threadId = store.drafts.create(root).threadId,
    operationId = crypto.randomUUID();
  store.answerHistory.prepare(
    {
      threadId,
      nativeSessionKey: "native",
      connectionGeneration: crypto.randomUUID(),
      requestId: "A",
    },
    {
      id: "A",
      method: "input",
      title: "Question",
      status: "pending",
      expiresAt: null,
    },
    operationId,
    { kind: "value", value: "frozen" },
  );
  store.answerHistory.finish(operationId, "written");
  store.close();
  store = AppStorage.open(path);
  const handle = vi.fn<IpcMain["handle"]>();
  let valid = true;
  const record = vi.fn();
  registerAnswerHistoryIpc({
    ipcMain: { handle },
    sourceValid: () => valid,
    getStore: () => store,
    getDiagnostics: () => ({ processInstanceId: crypto.randomUUID(), record }),
  });
  try {
    const handler = handle.mock.calls[0]![1],
      event = {} as IpcMainInvokeEvent,
      request = { threadId, traceId: crypto.randomUUID(), cursor: null };
    expect(await handler(event, request)).toMatchObject({
      threadId,
      source: "app-observed",
      entries: expect.arrayContaining([
        expect.objectContaining({
          kind: "answer",
          status: "written",
          answer: { kind: "value", value: "frozen" },
        }),
      ]),
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: request.traceId,
        operation: "runtime:answer-history",
        stage: "completed",
      }),
    );
    expect(JSON.stringify(record.mock.calls)).not.toContain("frozen");
    expect(() =>
      handler(event, { ...request, threadId: crypto.randomUUID() }),
    ).toThrow();
    valid = false;
    expect(() => handler(event, request)).toThrow(/source/);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import type {
  DiagnosticFilter,
  DiagnosticSnapshot,
} from "../../../shared/diagnostics";
import { registerDiagnosticIpc } from "./diagnostics";

const roots: string[] = [];
afterEach(() => {
  for (const path of roots.splice(0))
    rmSync(path, { recursive: true, force: true });
});
const filter: DiagnosticFilter = {
  since: "2026-10-01T00:00:00.000Z",
  until: "2026-10-07T00:00:00.000Z",
  limit: 100,
};
const snapshot: DiagnosticSnapshot = {
  sampledAt: "2026-10-06T00:00:00.000Z",
  filter,
  records: [],
  coverage: {
    files: 0,
    bytes: 0,
    lines: 0,
    malformed: 0,
    redacted: 0,
    unreadable: 0,
    truncated: false,
  },
  writer: { dropped: 0, degraded: false },
};
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-diagnostic-export-"));
  roots.push(directory);
  const file = join(directory, "report.json");
  const handle = vi.fn<IpcMain["handle"]>();
  const context = {
    ipcMain: { handle },
    sourceValid: vi.fn(() => true),
    read: vi.fn(async () => snapshot),
    chooseDestination: vi.fn(async (): Promise<string | null> => file),
    record: vi.fn(),
    getSourceGeneration: vi.fn(() => 1),
    getWriterId: () => crypto.randomUUID(),
  };
  registerDiagnosticIpc(context);
  const handler = handle.mock.calls[0]?.[1];
  if (!handler) throw Error("Missing handler");
  const senderFrame = {
    url: "file:///app/index.html",
    processId: 42,
    routingId: 1,
  };
  const event = { senderFrame } as IpcMainInvokeEvent;
  const request = (kind: "query" | "export", overrides: object = {}) =>
    handler(event, {
      kind,
      traceId: crypto.randomUUID(),
      filter,
      ...overrides,
    });
  return { context, file, directory, event, request };
}
it("exports bounded metadata into a private local report only after native save consent", async () => {
  const f = setup();
  const traceId = crypto.randomUUID();
  await expect(f.request("export", { traceId })).resolves.toEqual({
    kind: "exported",
    traceId,
    fileName: "report.json",
  });
  const exported = JSON.parse(readFileSync(f.file, "utf8"));
  expect(exported).toMatchObject({
    schemaVersion: 1,
    snapshot,
    attribution: "unknown",
  });
  expect(JSON.stringify(exported)).not.toContain(f.directory);
  expect(readdirSync(f.directory)).toEqual(["report.json"]);
  expect(f.context.record.mock.calls.map(([e]) => e.stage)).toEqual([
    "received",
    "completed",
  ]);
});
it("cancelled save and invalid renderer never create an export or read logs", async () => {
  const f = setup();
  f.context.chooseDestination.mockResolvedValueOnce(null);
  expect(await f.request("export")).toMatchObject({ kind: "cancelled" });
  expect(readdirSync(f.directory)).toEqual([]);
  f.context.sourceValid.mockReturnValue(false);
  await expect(f.request("query")).rejects.toThrow("Invalid diagnostic source");
  expect(f.context.read).toHaveBeenCalledTimes(1);
});
it("navigation to the same URL during the save dialog cannot export into a new document", async () => {
  const f = setup();
  f.context.chooseDestination.mockImplementationOnce(async () => {
    f.context.getSourceGeneration.mockReturnValue(2);
    return f.file;
  });
  expect(await f.request("export")).toMatchObject({
    kind: "failed",
    reason: "source-changed",
  });
  expect(readdirSync(f.directory)).toEqual([]);
});
it("bounds concurrent requests while native save is outstanding and permits retry after cancellation", async () => {
  const f = setup();
  let finish: (value: string | null) => void = () => {};
  f.context.chooseDestination.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const exporting = f.request("export");
  await vi.waitFor(() =>
    expect(f.context.chooseDestination).toHaveBeenCalled(),
  );
  expect(await f.request("query")).toMatchObject({
    kind: "failed",
    reason: "busy",
  });
  expect(f.context.read).toHaveBeenCalledTimes(1);
  finish(null);
  await exporting;
  expect(await f.request("query")).toMatchObject({ kind: "snapshot" });
});
it("read and filesystem failure return bounded typed reasons without leaking paths or messages", async () => {
  const f = setup();
  f.context.read.mockRejectedValueOnce(
    Error("Bearer secret https://private/project"),
  );
  const failure = await f.request("query");
  expect(failure).toMatchObject({ kind: "failed", reason: "read-unavailable" });
  expect(JSON.stringify(failure)).not.toMatch(/secret|https|private/);
  f.context.chooseDestination.mockResolvedValueOnce(
    join(f.directory, "missing", "report.json"),
  );
  expect(await f.request("export")).toMatchObject({
    kind: "failed",
    reason: "export-unavailable",
  });
  expect(readdirSync(f.directory)).toEqual([]);
});
it("oversized or arbitrary path-bearing requests are rejected before reading", async () => {
  const f = setup();
  await expect(
    f.request("query", {
      path: "/private/log",
      filter: { ...filter, limit: 501 },
    }),
  ).rejects.toThrow();
  expect(f.context.read).not.toHaveBeenCalled();
});

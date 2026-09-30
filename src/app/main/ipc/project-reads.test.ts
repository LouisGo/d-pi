import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import type { DiagnosticEvent } from "../../../platform/main/diagnostics/public";
import { AppStorage } from "../wiring/app-storage";
import type { ProjectReadContext } from "./context";
import { registerFilesIpc, registerGitIpc } from "./project-reads";

const reads = vi.hoisted(() => ({
  listFiles: vi.fn(),
  readFile: vi.fn(),
  listGit: vi.fn(),
  readGit: vi.fn(),
}));
vi.mock("../../../modules/files/main/public", () => ({
  listProjectFiles: reads.listFiles,
  readProjectFile: reads.readFile,
}));
vi.mock("../../../modules/changes/main/public", () => ({
  listGitChanges: reads.listGit,
  readGitChange: reads.readGit,
}));
const stores: { store: AppStorage; directory: string }[] = [];
afterEach(() => {
  for (const { store, directory } of stores.splice(0)) {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "d-pi-read-diagnostics-"));
  const store = AppStorage.open(join(directory, "app.sqlite"));
  stores.push({ store, directory });
  const thread = store.threads.create("/fixture");
  const events: DiagnosticEvent[] = [];
  const diagnostics = {
    processInstanceId: crypto.randomUUID(),
    record: (event: DiagnosticEvent) => events.push(event),
  };
  const handle = vi.fn<IpcMain["handle"]>();
  const context: ProjectReadContext = {
    ipcMain: { handle },
    sourceValid: () => true,
    getStore: () => store,
    getDiagnostics: () => diagnostics,
    nativeSessionsPath: () => "/fixture-sessions",
  };
  registerFilesIpc(context);
  registerGitIpc(context);
  return {
    thread,
    events,
    request: (channel: string, raw: unknown) => {
      const handler = handle.mock.calls.find(([name]) => name === channel)?.[1];
      if (!handler) throw Error("Missing handler");
      return handler({} as IpcMainInvokeEvent, raw);
    },
  };
}

it.each(["files", "git"] as const)(
  "records %s received while I/O is pending and a bounded terminal after it settles",
  async (domain) => {
    const fixture = setup();
    let finish: (value: unknown) => void = () => {};
    const wait = new Promise((resolve) => {
      finish = resolve;
    });
    (domain === "files" ? reads.listFiles : reads.listGit).mockReturnValueOnce(
      wait,
    );
    const traceId = crypto.randomUUID();
    const raw = {
      kind: "list",
      threadId: fixture.thread.threadId,
      traceId,
      ...(domain === "files" ? { path: "" } : {}),
    };
    const result = fixture.request(`${domain}:request`, raw);
    expect(fixture.events).toHaveLength(1);
    expect(fixture.events[0]).toMatchObject({
      traceId,
      threadId: fixture.thread.threadId,
      operation: `${domain}:list`,
      stage: "received",
    });
    finish({ kind: "unavailable", reason: "missing" });
    await expect(result).resolves.toEqual({
      kind: "unavailable",
      reason: "missing",
    });
    expect(fixture.events[1]).toMatchObject({
      traceId,
      requestId: fixture.events[0]?.requestId,
      stage: "failed",
      code: "missing",
      durationMs: expect.any(Number),
    });
    expect(fixture.events[1]?.durationMs).toBeGreaterThanOrEqual(0);
  },
);

it("records a thrown sampling error as failure and preserves the original cause", async () => {
  const fixture = setup();
  const cause = Error("PRIVATE FILE BODY");
  reads.readFile.mockRejectedValueOnce(cause);
  const result = fixture.request("files:request", {
    kind: "read",
    threadId: fixture.thread.threadId,
    traceId: crypto.randomUUID(),
    path: "sample.txt",
  });
  await expect(result).rejects.toBe(cause);
  expect(fixture.events.map((event) => event.stage)).toEqual([
    "received",
    "failed",
  ]);
  expect(fixture.events[1]).toMatchObject({
    code: "failed",
    durationMs: expect.any(Number),
  });
  expect(JSON.stringify(fixture.events)).not.toContain("PRIVATE FILE BODY");
});

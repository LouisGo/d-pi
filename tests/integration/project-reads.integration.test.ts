import { spawn } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { IpcMain, IpcMainInvokeEvent, IpcRenderer } from "electron";
import { expect, it, vi } from "vitest";
import type { ProjectReadContext } from "../../src/app/main/ipc/context";
import {
  ProjectReadOperations,
  registerFilesIpc,
  registerGitIpc,
} from "../../src/app/main/ipc/project-reads";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { createProjectReadBridge } from "../../src/app/preload/bridges/project-reads";
import { createProjectGitReader } from "../../src/modules/changes/main/public";
import { gitQueryOptions } from "../../src/modules/changes/renderer/public";
import { fileQueryOptions } from "../../src/modules/files/renderer/public";

it("connects real Files and shared Git cancellation through Query → preload DTO → Main → physical close", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "d-pi-read-chain-")),
  );
  const store = AppStorage.open(join(root, "app.sqlite"));
  const thread = store.threads.create(root);
  const client = new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
  const reads = new ProjectReadOperations();
  let childReady = false;
  let childClosed = false;
  const gitReader = createProjectGitReader({
    spawn: (_command, _args, options) => {
      const child = spawn(
        process.execPath,
        ["-e", "process.stdout.write('ready');setTimeout(()=>{},10000);"],
        options,
      );
      child.stdout?.once("data", () => {
        childReady = true;
      });
      child.once("close", () => {
        childClosed = true;
      });
      return child;
    },
  });
  const handle = vi.fn<IpcMain["handle"]>();
  const event = {
    sender: { id: 1 },
    senderFrame: { processId: 2, routingId: 3 },
  } as IpcMainInvokeEvent;
  const context: ProjectReadContext = {
    ipcMain: { handle },
    sourceValid: (input) => input === event,
    reads,
    gitReader,
    getStore: () => store,
    getDiagnostics: () => undefined,
    nativeSessionsPath: () => root,
    projectNativeSessionsPath: async () => null,
  };
  registerFilesIpc(context);
  registerGitIpc(context);
  const invoke = vi.fn(async (channel: string, raw: unknown) => {
    const callback = handle.mock.calls.find(([name]) => name === channel)?.[1];
    if (!callback) throw Error("Missing read IPC fixture");
    return callback(event, raw);
  });
  const bridge = createProjectReadBridge({ invoke } as unknown as IpcRenderer);
  if (!bridge.files || !bridge.git) throw Error("Missing read bridge");
  try {
    await writeFile(join(root, "sample.txt"), "complete real file\n");
    const file = await client.fetchQuery(
      fileQueryOptions.content(bridge.files, thread, "sample.txt"),
    );
    expect(file).toMatchObject({
      kind: "text",
      text: "complete real file\n",
      coverage: "complete",
    });
    expect(reads.size).toBe(0);
    const options = gitQueryOptions.changes(bridge.git, thread);
    const one = new QueryObserver(client, options);
    const two = new QueryObserver(client, options);
    const releaseOne = one.subscribe(() => {});
    const releaseTwo = two.subscribe(() => {});
    await vi.waitFor(() => expect(childReady).toBe(true));
    expect(gitReader.snapshot().active).toBe(1);
    releaseOne();
    await Promise.resolve();
    expect(childClosed).toBe(false);
    expect(
      invoke.mock.calls.filter(([channel]) => channel === "git:cancel"),
    ).toHaveLength(0);
    store.threads.create(join(root, "new-active-thread"));
    releaseTwo();
    await vi.waitFor(() => {
      expect(childClosed).toBe(true);
      expect(reads.size).toBe(0);
      expect(gitReader.snapshot()).toMatchObject({ active: 0, queued: 0 });
    });
    expect(
      invoke.mock.calls.filter(([channel]) => channel === "git:request"),
    ).toHaveLength(1);
    expect(
      invoke.mock.calls.filter(([channel]) => channel === "git:cancel"),
    ).toHaveLength(1);
    const command = invoke.mock.calls.find(
      ([channel]) => channel === "git:request",
    )?.[1];
    const cancellation = invoke.mock.calls.find(
      ([channel]) => channel === "git:cancel",
    )?.[1];
    expect(cancellation).toMatchObject({
      operationId: (command as { operationId: string }).operationId,
      traceId: (command as { traceId: string }).traceId,
    });
    expect(Object.keys(cancellation as object).sort()).toEqual([
      "operationId",
      "traceId",
    ]);
  } finally {
    client.clear();
    await Promise.all([reads.close(), gitReader.close()]);
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

it("settles the overall deadline only after a TERM-ignoring real child closes", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "d-pi-read-deadline-")),
  );
  const operations = new ProjectReadOperations({
    maxOperations: 1,
    maxPerSender: 1,
    timeoutMs: 200,
  });
  let signal: AbortSignal | undefined;
  let ready = false;
  let closed = false;
  const reader = createProjectGitReader({
    stopGraceMs: 100,
    spawn: (_command, _args, options) => {
      const child = spawn(
        process.execPath,
        [
          "-e",
          "process.on('SIGTERM',()=>{});process.stdout.write('ready');setInterval(()=>{},1000);",
        ],
        options,
      );
      child.stdout?.once("data", () => {
        ready = true;
      });
      child.once("close", () => {
        closed = true;
      });
      return child;
    },
  });
  const event = {
    sender: { id: 1 },
    senderFrame: { processId: 2, routingId: 3 },
  } as IpcMainInvokeEvent;
  const identity = {
    operationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
  };
  try {
    const pending = operations.run(event, identity, (value) => {
      signal = value;
      return reader.list(root, value);
    });
    await vi.waitFor(() => expect(ready).toBe(true));
    await vi.waitFor(() => expect(signal?.aborted).toBe(true));
    expect(closed).toBe(false);
    expect(operations.size).toBe(1);
    expect(reader.snapshot().active).toBe(1);
    await expect(pending).resolves.toMatchObject({
      kind: "failed",
      error: { ...identity, code: "timeout", retryable: true },
    });
    expect(closed).toBe(true);
    expect(operations.size).toBe(0);
    expect(reader.snapshot()).toMatchObject({ active: 0, queued: 0 });
  } finally {
    await Promise.all([operations.close(), reader.close()]);
    await rm(root, { recursive: true, force: true });
  }
});

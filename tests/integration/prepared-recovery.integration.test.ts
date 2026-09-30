import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import type {
  SubmissionBridge,
  SubmissionReply,
} from "../../src/modules/execution/contracts/public";
import {
  type HostCommand,
  HostCommandSchema,
} from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/public";
import { SubmissionModel } from "../../src/modules/execution/renderer/public";
import { DraftController } from "../../src/modules/input/core/public";
import { TraceIdSchema } from "../../src/shared/identity";

const electron = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("electron", () => ({ utilityProcess: { fork: electron.fork } }));
vi.mock("../../src/platform/omp/resources/public", () => ({
  managedSdkRuntime: async () => ({
    binary: "/fixture/bun",
    entry: "/fixture/host.mjs",
  }),
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

async function interruptedRenderer() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "d-pi-prepared-recovery-")),
  );
  const project = join(root, "project");
  mkdirSync(project);
  const store = AppStorage.open(join(root, "app.sqlite"));
  const draft = store.drafts.create(project);
  store.drafts.save(draft.threadId, 0, "A");
  const host = new EventEmitter();
  const commands: HostCommand[] = [];
  electron.fork.mockReturnValue(
    Object.assign(host, {
      postMessage(raw: unknown) {
        const command = HostCommandSchema.parse(raw);
        commands.push(command);
        if (command.kind === "start")
          queueMicrotask(() =>
            host.emit("message", {
              kind: "ready",
              processInstanceId: command.processInstanceId,
              connectionGeneration: command.connectionGeneration,
              state: {
                sessionId: "native",
                sessionFile: join(root, "native.jsonl"),
                model: { id: "model", provider: "fixture" },
                isStreaming: false,
                isCompacting: false,
                queuedMessageCount: 0,
              },
            }),
          );
      },
    }),
  );
  let receive: (reply: SubmissionReply) => void = () => {};
  const runtime = new RuntimeService(
    store,
    root,
    root,
    {},
    () => {},
    (reply) => receive(reply),
  );
  const act = (kind: "allow" | "start" | "revoke") =>
    runtime.execute({
      kind,
      threadId: draft.threadId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
    });
  await act("allow");
  await act("start");
  const controllers: DraftController[] = [];
  const models: SubmissionModel[] = [];
  const createRenderer = (
    request: SubmissionBridge["request"] = (command) => runtime.submit(command),
  ) => {
    const controller = new DraftController(
      store.drafts.read(draft.threadId),
      async (revision, text) => {
        const saved = store.drafts.save(draft.threadId, revision, text);
        if (saved === null) throw Error("unexpected draft conflict");
        return { kind: "saved", threadId: draft.threadId, revision: saved };
      },
      () => {
        throw Error("unexpected save failure");
      },
    );
    const model = new SubmissionModel(
      {
        request,
        subscribe(listener) {
          receive = listener;
          return () => {
            receive = () => {};
          };
        },
      },
      draft.threadId,
      controller,
    );
    controllers.push(controller);
    models.push(model);
    return { controller, model };
  };
  cleanup.push(() => {
    for (const m of models) m.dispose();
    for (const c of controllers) c.dispose();
    host.emit("exit");
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  let prepared = false;
  let release: () => void = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const old = createRenderer(async (command) => {
    const reply = await runtime.submit(command);
    if (command.kind === "prepare") {
      prepared = true;
      await barrier;
    }
    return reply;
  });
  const sending = old.model.send();
  await vi.waitFor(() => expect(prepared).toBe(true));
  old.model.dispose();
  old.controller.dispose();
  release();
  await sending;
  const receipt = store.submissions.list(draft.threadId)[0];
  if (!receipt) throw Error("missing prepared record");
  expect(receipt.state).toBe("prepared");
  const writes = () => commands.filter((c) => c.kind === "dispatch");
  expect(writes()).toHaveLength(0);
  const current = createRenderer();
  await current.model.refresh();
  expect(writes()).toHaveLength(0);
  return { ...current, store, draft, receipt, writes, host, act };
}

it.each(["unchanged", "edited-before", "edited-after"] as const)(
  "explicit prepared recovery keeps its identity and protects %s draft",
  async (change) => {
    const f = await interruptedRenderer();
    let clears = 0;
    const detachEditor = f.model.attachEditor(() => {
      clears++;
      return true;
    });
    if (change === "edited-before") f.controller.edit("B");
    await Promise.all([
      f.model.continuePrepared(f.receipt.submissionId),
      f.model.continuePrepared(f.receipt.submissionId),
    ]);
    expect(f.writes()).toHaveLength(1);
    expect(f.writes()[0]).toMatchObject({
      value: { submissionId: f.receipt.submissionId, text: "A" },
    });
    if (change === "edited-after") f.controller.edit("B");
    f.host.emit("message", {
      kind: "submission",
      event: {
        kind: "ack",
        submissionId: f.receipt.submissionId,
        requestId: f.receipt.requestId,
        target: f.receipt.target,
      },
    });
    await f.controller.flush();
    expect(clears).toBe(change === "unchanged" ? 1 : 0);
    expect(f.store.drafts.read(f.draft.threadId).text).toBe(
      change === "unchanged" ? "" : "B",
    );
    await f.model.continuePrepared(f.receipt.submissionId);
    expect(f.writes()).toHaveLength(1);
    expect(f.store.submissions.list(f.draft.threadId)).toHaveLength(1);
    detachEditor();
  },
);

it.each(["revoked", "exited"] as const)(
  "revalidates a recovered prepared attempt after target becomes %s",
  async (cause) => {
    const f = await interruptedRenderer();
    if (cause === "revoked") await f.act("revoke");
    else f.host.emit("exit");
    await f.model.continuePrepared(f.receipt.submissionId);
    expect(f.writes()).toHaveLength(0);
    expect(f.model.getSnapshot().receipts[0]?.state).toBe("rejected");
    expect(f.store.drafts.read(f.draft.threadId).text).toBe("A");
  },
);

it("does not dispatch recovered unknown outcomes through prepared continuation", async () => {
  const f = await interruptedRenderer();
  f.store.submissions.dispatchSubmission(f.receipt.submissionId);
  f.store.submissions.unknownSubmission(f.receipt.submissionId);
  await f.model.refresh();
  await f.model.continuePrepared(f.receipt.submissionId);
  expect(f.writes()).toHaveLength(0);
  expect(f.model.getSnapshot().receipts[0]?.state).toBe("unknown");
});

it("continues an interrupted explicit resend without consuming the current draft", async () => {
  const f = await interruptedRenderer();
  const replay = f.store.submissions.prepareSubmission({
    ...f.receipt,
    submissionId: crypto.randomUUID() as typeof f.receipt.submissionId,
    requestId: crypto.randomUUID(),
    retryOf: f.receipt.submissionId,
  });
  await f.model.refresh();
  let clears = 0;
  const detachEditor = f.model.attachEditor(() => {
    clears++;
    return true;
  });
  await f.model.continuePrepared(replay.submissionId);
  f.host.emit("message", {
    kind: "submission",
    event: {
      kind: "ack",
      submissionId: replay.submissionId,
      requestId: replay.requestId,
      target: replay.target,
    },
  });
  await f.controller.flush();
  expect(clears).toBe(0);
  expect(f.store.drafts.read(f.draft.threadId).text).toBe("A");
  expect(f.writes()).toHaveLength(1);
  detachEditor();
});

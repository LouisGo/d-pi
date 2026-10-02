import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import {
  HostTransportCommandSchema,
  SubmissionIdSchema,
  type SubmissionReply,
} from "../../src/modules/execution/contracts/public";
import type {
  NativeObservation,
  NativeSessionOptions,
} from "../../src/modules/execution/host/public";
import { createSessionHost } from "../../src/modules/execution/host/public";
import { RuntimeService } from "../../src/modules/execution/main/public";
import { SubmissionModel } from "../../src/modules/execution/renderer/public";
import { DraftController } from "../../src/modules/input/core/public";
import { TraceIdSchema } from "../../src/shared/identity";

const transport = vi.hoisted(() => ({
  fork: vi.fn(),
  observe: (_event: NativeObservation) => {},
  writes: [] as string[],
}));
vi.mock("electron", () => ({ utilityProcess: { fork: transport.fork } }));
vi.mock("../../src/platform/omp/resources/public", () => ({
  managedSdkRuntime: async () => ({
    binary: "/fixture/bun",
    entry: "/fixture/host.mjs",
  }),
}));
vi.mock("../../src/modules/execution/host/native/native-session", () => ({
  NativeSession: class {
    constructor(
      private options: NativeSessionOptions,
      observe: (event: NativeObservation) => void,
    ) {
      transport.observe = observe;
    }
    async start() {}
    async close() {}
    write(frame: string) {
      transport.writes.push(frame);
    }
    async request(command: string) {
      if (command === "d_pi_subagent_state")
        return { success: true, data: { agents: [] } };
      if (command === "d_pi_state")
        return {
          success: true,
          data: {
            paused: false,
            stopping: false,
            streaming: false,
            compacting: false,
            queued: 0,
            queue: [],
            background: 0,
            pendingAsync: false,
            admitted: false,
          },
        };
      return {
        success: true,
        data: {
          sessionId: "native",
          sessionFile: join(this.options.sessionDirectory, "session.jsonl"),
          model: { id: "model", provider: "fixture" },
          isStreaming: false,
          isCompacting: false,
          queuedMessageCount: 0,
        },
      };
    }
  },
}));
const cleanup: (() => void)[] = [];
afterEach(() => {
  transport.observe({ kind: "disconnected", reason: "exit" });
  for (const close of cleanup.splice(0)) close();
  transport.writes.length = 0;
});

async function running(
  publishSubmission: (reply: SubmissionReply) => void = () => {},
) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "d-pi-host-integration-")),
  );
  const project = join(root, "project");
  mkdirSync(project);
  const store = AppStorage.open(join(root, "app.sqlite"));
  const draft = store.drafts.create(project);
  store.drafts.save(draft.threadId, 0, "A");
  const process = new EventEmitter();
  let scopeId = "";
  const host = createSessionHost(
    (message) => process.emit("message", { scopeId, message }),
    () => process.emit("exit"),
  );
  transport.fork.mockReturnValue(
    Object.assign(process, {
      postMessage: (raw: unknown) => {
        const envelope = HostTransportCommandSchema.parse(raw);
        scopeId = envelope.scopeId;
        void host.handle(envelope.command);
      },
    }),
  );
  const runtime = new RuntimeService(
    store,
    root,
    root,
    {},
    () => {},
    publishSubmission,
  );
  cleanup.push(() => {
    process.emit("exit");
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  for (const kind of ["allow", "start"] as const)
    await runtime.execute({
      kind,
      threadId: draft.threadId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
    });
  async function submit(text: string, revision: number) {
    const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
    const prepared = await runtime.submit({
      kind: "prepare",
      threadId: draft.threadId,
      submissionId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
      text,
      revision,
    });
    if (prepared.kind !== "receipt") throw Error("prepare failed");
    await runtime.submit({
      kind: "dispatch",
      threadId: draft.threadId,
      submissionId,
    });
    return prepared.receipt;
  }
  function response(id: string, success: boolean) {
    transport.observe({
      kind: "frame",
      frame: { type: "response", command: "prompt", id, success },
    });
  }
  return { root, project, runtime, store, draft, host, submit, response };
}

it("native disconnection affects B in flight but not settled A retained for late correlation", async () => {
  const f = await running();
  const a = await f.submit("A", 1);
  f.response(a.requestId, true);
  transport.observe({
    kind: "frame",
    frame: {
      type: "prompt_result",
      id: a.requestId,
      status: "completed",
      agentInvoked: true,
      sessionSettled: true,
    },
  });
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(false);
  f.store.drafts.save(f.draft.threadId, 1, "B");
  const b = await f.submit("B", 2);
  transport.observe({ kind: "disconnected", reason: "exit" });
  expect(f.store.submissions.submission(a.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "completed",
  });
  expect(f.store.submissions.submission(b.submissionId)).toMatchObject({
    state: "unknown",
    outcome: "unknown",
  });
  expect(transport.writes).toHaveLength(2);
});

it("retains late native failures after ACK and idle and never settles a missing terminal merely on idle", async () => {
  const f = await running();
  const a = await f.submit("A", 1);
  f.response(a.requestId, true);
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(true);
  f.response(a.requestId, false);
  expect(f.store.submissions.submission(a.submissionId)).toMatchObject({
    state: "acknowledged",
    outcome: "failed",
  });
  transport.observe({
    kind: "frame",
    frame: {
      type: "prompt_result",
      id: a.requestId,
      status: "error",
      agentInvoked: true,
      sessionSettled: true,
    },
  });
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(false);
  f.store.drafts.save(f.draft.threadId, 1, "B");
  const b = await f.submit("B", 2);
  await f.host.handle({ kind: "state" });
  expect(f.runtime.hasActiveWork()).toBe(true);
  transport.observe({ kind: "disconnected", reason: "exit" });
  expect(f.store.submissions.submission(a.submissionId)?.outcome).toBe(
    "failed",
  );
  expect(f.store.submissions.submission(b.submissionId)?.outcome).toBe(
    "unknown",
  );
});

it.each(["/move:/tmp", "/wt branch", "/worktree:branch", "/session:DELETE\t"])(
  "rejects %s before native dispatch, including explicit resend, without breaking the existing binding",
  async (text) => {
    const f = await running();
    const binding = f.store.threads.nativeSessionBinding(f.draft.threadId);
    f.store.drafts.save(f.draft.threadId, 1, text);
    const submissionId = SubmissionIdSchema.parse(crypto.randomUUID());
    const command = {
      kind: "prepare" as const,
      threadId: f.draft.threadId,
      submissionId,
      traceId: TraceIdSchema.parse(crypto.randomUUID()),
      text,
      revision: 2,
    };
    expect(await f.runtime.submit(command)).toMatchObject({
      kind: "failed",
      code: "unsupported-native-command",
      error: { message: { code: "submission.unsupportedNativeCommand" } },
    });
    expect(f.store.drafts.read(f.draft.threadId).text).toBe(text);
    expect(transport.writes).toEqual([]);
    // A receipt persisted by an older version must not bypass the policy through resend.
    f.store.drafts.save(f.draft.threadId, 2, "normal");
    const next = await f.submit("normal", 3);
    f.response(next.requestId, true);
    await f.host.handle({ kind: "state" });
    // Existing receipt snapshots may contain an unsupported command from the old build.
    // Use the public storage interface to construct that old receipt with the actual target.
    f.store.drafts.save(f.draft.threadId, 3, text);
    const legacy = {
      ...next,
      submissionId: SubmissionIdSchema.parse(crypto.randomUUID()),
      requestId: crypto.randomUUID(),
      revision: 4,
      text,
    };
    f.store.submissions.prepareSubmission(legacy);
    expect(
      await f.runtime.submit({
        kind: "resend",
        threadId: f.draft.threadId,
        submissionId: SubmissionIdSchema.parse(crypto.randomUUID()),
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
        originalId: legacy.submissionId,
      }),
    ).toMatchObject({ kind: "failed", code: "unsupported-native-command" });
    await f.host.handle({ kind: "dispatch", value: legacy });
    expect(transport.writes).toHaveLength(1);
    expect(f.store.threads.nativeSessionBinding(f.draft.threadId)).toEqual(
      binding,
    );
  },
);

it("Renderer retries unchanged input through Main and Host after interaction rejects dispatch", async () => {
  let receive: (reply: SubmissionReply) => void = () => {};
  const f = await running((reply) => receive(reply));
  const controller = new DraftController(
    f.store.drafts.read(f.draft.threadId),
    async (revision, text) => {
      const saved = f.store.drafts.save(f.draft.threadId, revision, text);
      if (saved === null) throw Error("unexpected draft conflict");
      return { kind: "saved", threadId: f.draft.threadId, revision: saved };
    },
    () => {
      throw Error("unexpected save failure");
    },
  );
  let firstDispatch = true;
  const model = new SubmissionModel(
    {
      subscribe(listener) {
        receive = listener;
        return () => {};
      },
      async request(command) {
        if (command.kind === "dispatch" && firstDispatch) {
          firstDispatch = false;
          transport.observe({
            kind: "frame",
            frame: {
              type: "extension_ui_request",
              id: "dialog",
              method: "confirm",
              title: "Confirm",
            },
          });
        }
        return f.runtime.submit(command);
      },
    },
    f.draft.threadId,
    controller,
  );
  try {
    await model.send();
    expect(model.getSnapshot().receipts[0]?.state).toBe("rejected");
    expect(transport.writes).toHaveLength(0);
    transport.observe({
      kind: "frame",
      frame: {
        type: "extension_ui_request",
        method: "cancel",
        targetId: "dialog",
      },
    });
    await model.send();
    expect(transport.writes).toHaveLength(1);
    expect(
      f.store.submissions.list(f.draft.threadId).map((r) => r.state),
    ).toEqual(["dispatching", "rejected"]);
    expect(f.store.drafts.read(f.draft.threadId)).toMatchObject({
      text: "A",
      revision: 1,
    });
  } finally {
    model.dispose();
    controller.dispose();
  }
});

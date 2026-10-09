import { expect, it, vi } from "vitest";
import {
  type RuntimeView,
  RuntimeViewSchema,
  SubmissionReceiptSchema,
} from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import { transportFailure } from "./model";
import { ThreadModel } from "./thread-model";

async function fixture(
  options: {
    origin?: "cli";
    busy?: boolean;
    fail?: boolean;
    generation?: boolean;
    phase?: "interrupted" | "failed";
  } = {},
) {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "continue here",
    ...(options.origin ? { origin: options.origin } : {}),
  });
  let finish = () => {};
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let emit: (view: RuntimeView) => void = () => {};
  let revision = 0;
  const commands: string[] = [];
  let prepared: ReturnType<typeof SubmissionReceiptSchema.parse> | undefined;
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "save")
        return {
          kind: "saved",
          threadId: command.threadId,
          revision: command.expectedRevision + 1,
        };
      throw Error("unexpected desktop command");
    },
    runtime: {
      subscribe: (listener) => {
        emit = listener;
        return () => {};
      },
      request: async (command) => {
        commands.push(command.kind);
        const view = (phase: RuntimeView["phase"]) =>
          RuntimeViewSchema.parse({
            threadId: draft.threadId,
            traceId: command.traceId,
            revision: ++revision,
            phase,
            trusted: true,
            busy: phase === "starting" || !!options.busy,
            model: phase === "ready" ? "fixture/model" : null,
            ...(options.generation
              ? { connectionGeneration: crypto.randomUUID() }
              : {}),
            configuration: { code: "runtime.configDefault" },
            message: { code: "runtime.disconnected" },
          });
        if (command.kind === "start") {
          emit(view("starting"));
          await gate;
          return {
            kind: "view",
            view: view(options.fail ? "failed" : "ready"),
          };
        }
        return { kind: "view", view: view(options.phase ?? "interrupted") };
      },
    },
    submission: {
      subscribe: () => () => {},
      request: async (command) => {
        commands.push(command.kind);
        if (command.kind === "list") return { kind: "list", receipts: [] };
        if (command.kind === "prepare") {
          const { kind: _kind, ...frozen } = command;
          prepared = SubmissionReceiptSchema.parse({
            ...frozen,
            requestId: crypto.randomUUID(),
            target: {
              processInstanceId: crypto.randomUUID(),
              connectionGeneration: crypto.randomUUID(),
              configContextId: "fixture",
              nativeSessionRef: "original-session",
            },
            state: "prepared",
            acknowledgedAt: null,
            outcome: "unobserved",
            createdAt: "1",
            updatedAt: "1",
          });
          return { kind: "receipt", receipt: prepared };
        }
        if (command.kind === "dispatch" && prepared)
          return {
            kind: "receipt",
            receipt: { ...prepared, state: "dispatching" },
          };
        throw Error("unexpected submission command");
      },
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const thread = new ThreadModel(draft, bridge, transportFailure);
  thread.activate();
  await Promise.resolve();
  return { thread, commands, finish, prepared: () => prepared };
}
it("a new message in CLI history prepares the original session and dispatches the frozen draft once", async () => {
  const f = await fixture({ origin: "cli" });
  try {
    expect(f.commands).not.toContain("start");
    expect(f.thread.canSend()).toBe(true);
    const sending = f.thread.submission?.send();
    await vi.waitFor(() => expect(f.commands).toContain("start"));
    await f.thread.submission?.send();
    f.thread.controller.edit("later draft");
    f.finish();
    await sending;
    expect(f.commands.filter((kind) => kind !== "list")).toEqual([
      "inspect",
      "start",
      "prepare",
      "dispatch",
    ]);
    expect(f.prepared()?.text).toBe("continue here");
    expect(f.thread.controller.getTextSnapshot()).toBe("later draft");
  } finally {
    f.thread.dispose();
  }
});
it.each([
  { origin: "cli" as const, busy: true },
  { generation: true },
  { origin: "cli" as const, fail: true },
  { phase: "failed" as const, fail: true },
])(
  "does not dispatch when preparation is unresolved or fails: %j",
  async (options) => {
    const f = await fixture(options);
    try {
      f.finish();
      await f.thread.submission?.send();
      expect(f.commands).not.toContain("prepare");
      expect(f.commands).not.toContain("dispatch");
      expect(f.thread.controller.getTextSnapshot()).toBe("continue here");
    } finally {
      f.thread.dispose();
    }
  },
);

import { isAbsolute, relative } from "node:path";
import { match } from "ts-pattern";
import { z } from "zod";
import { ControlStateSchema } from "../features/control/contracts";
import { ConversationProjection } from "../features/conversation/projection";
import {
  type HostCommand,
  type HostMessage,
  type HostStart,
  type NativeState,
  NativeStateSchema,
} from "../features/runtime/host-contracts";
import type { FrozenSubmission } from "../features/submission/contracts";
import { identifyDirectory } from "../shared/node/directory";
import { PendingInteractions } from "./interactions";
import { type NativeObservation, NativeSession } from "./native-session";

export interface ReadingPort {
  start(): void;
  close(): void;
  postMessage(event: unknown): void;
}
export interface SessionHost {
  handle(command: HostCommand, port?: ReadingPort): Promise<void>;
}
// One owner per utility instance. Merely importing this module creates no processes or listeners.
export function createSessionHost(
  send: (message: HostMessage) => void,
  exit: (code: number) => void,
): SessionHost {
  const LocalPromptCompletionSchema = z.object({
    agentInvoked: z.literal(false),
  });
  let readingPort: ReadingPort | null = null;
  let projection: ConversationProjection | null = null;
  let native: NativeSession | null = null;
  let start: HostStart | null = null;
  let state: NativeState | null = null;
  let busy = false;
  let paused = false;
  const interactions = new PendingInteractions(publishInteractions);
  function publishInteractions(): void {
    if (start)
      send({
        kind: "interactions",
        view: {
          generation: start.connectionGeneration,
          items: interactions.snapshot(),
          unsupported: interactions.unsupported,
        },
      });
  }
  let closing = false;
  let starting = false;
  const prompts = new Map<
    string,
    {
      value: FrozenSubmission;
      acknowledged: boolean;
      timer: ReturnType<typeof setTimeout>;
      acknowledgementTimer: ReturnType<typeof setTimeout>;
    }
  >();
  function clearPrompts(): void {
    for (const entry of prompts.values()) {
      clearTimeout(entry.timer);
      clearTimeout(entry.acknowledgementTimer);
    }
    prompts.clear();
  }
  function observe(event: NativeObservation): void {
    if (event.kind === "disconnected") {
      if (closing) return;
      for (const entry of prompts.values())
        send({
          kind: "submission",
          event: {
            kind: "disconnected",
            submissionId: entry.value.submissionId,
            requestId: entry.value.requestId,
            target: entry.value.target,
          },
        });
      clearPrompts();
      interactions.disconnect();
      send({ kind: "interrupted", reason: event.reason });
      return;
    }
    const frame = event.frame;
    if (frame.type === "d_pi_control_state" && start) {
      const control = ControlStateSchema.safeParse(frame.data);
      if (control.success) {
        paused = control.data.paused;
        send({
          kind: "control",
          generation: start.connectionGeneration,
          state: control.data,
        });
      }
    }
    if (frame.type !== "d_pi_control_state") projection?.accept(frame);
    if (frame.type === "agent_start") busy = true;
    if (frame.type === "agent_end" && frame.isTerminal !== false) {
      busy = false;
      void refresh();
    }
    const hadInteraction = interactions.pending;
    interactions.update(frame);
    if (frame.type === "extension_ui_request" || frame.type.startsWith("host_"))
      publishInteractions();
    if (hadInteraction !== interactions.pending && state)
      send({
        kind: "state",
        state,
        busy,
        pendingInteraction: interactions.pending,
      });
    if (
      frame.type === "response" &&
      typeof frame.id === "string" &&
      frame.command === "prompt"
    ) {
      const entry = prompts.get(frame.id);
      if (entry && typeof frame.success === "boolean") {
        clearTimeout(entry.acknowledgementTimer);
        entry.acknowledged ||= frame.success;
        send({
          kind: "submission",
          event: {
            kind: frame.success ? "ack" : "error",
            submissionId: entry.value.submissionId,
            requestId: entry.value.requestId,
            target: entry.value.target,
          },
        });
        // Official builtins complete in the ACK; they do not emit agent_end.
        // Recheck native state before admitting another submission or idle shutdown.
        if (
          !frame.success ||
          LocalPromptCompletionSchema.safeParse(frame.data).success
        )
          void refresh();
      }
    }
    if (frame.type === "prompt_result" && frame.agentInvoked === false) {
      busy = false;
      void refresh();
    }
    // Reading events go directly to the Renderer port; Main receives supervision only.
  }
  async function refresh(): Promise<void> {
    try {
      const response = await native?.request("get_state");
      if (response?.success !== true) throw Error("Native state unavailable");
      state = NativeStateSchema.parse(response.data);
      busy =
        state.isStreaming || state.isCompacting || state.queuedMessageCount > 0;
      send({
        kind: "state",
        state,
        pendingInteraction: interactions.pending,
        busy,
      });
    } catch {
      send({ kind: "interrupted", reason: "state-unavailable" });
    }
  }
  async function launch(value: HostStart): Promise<void> {
    if (starting || native) throw Error("Host already owns an instance");
    starting = true;
    try {
      const identity = await identifyDirectory(value.identity.directory);
      if (
        identity.directory !== value.identity.directory ||
        identity.device !== value.identity.device ||
        identity.inode !== value.identity.inode
      )
        throw Error("Directory changed before spawn");
      start = value;
      projection = new ConversationProjection(
        value.connectionGeneration,
        (event) => {
          try {
            readingPort?.postMessage(event);
          } catch {
            readingPort?.close();
            readingPort = null;
          }
        },
      );
      native = new NativeSession(
        {
          binary: value.binary,
          ...(value.sdkEntry ? { entry: value.sdkEntry } : {}),
          directory: identity.directory,
          environment: value.environment,
          sessionDirectory: value.sessionDirectory,
        },
        observe,
      );
      await native.start();
      await refresh();
      if (!state?.sessionFile)
        throw Error("Native session reference unavailable");
      const within = relative(value.sessionDirectory, state.sessionFile);
      if (within.startsWith("..") || isAbsolute(within))
        throw Error("Unmanaged native session reference");
      send({
        kind: "ready",
        state,
        processInstanceId: value.processInstanceId,
        connectionGeneration: value.connectionGeneration,
      });
    } finally {
      starting = false;
    }
  }
  function dispatch(value: FrozenSubmission): void {
    if (prompts.has(value.requestId)) return;
    if (
      !native ||
      !start ||
      !state ||
      !state.model ||
      paused ||
      interactions.pending ||
      value.threadId !== start.threadId ||
      value.target.processInstanceId !== start.processInstanceId ||
      value.target.connectionGeneration !== start.connectionGeneration ||
      value.target.configContextId !== start.configContextId ||
      value.target.nativeSessionRef !== state.sessionFile ||
      prompts.size >= 128
    ) {
      send({
        kind: "submission",
        event: {
          kind: "disconnected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        },
      });
      return;
    }
    const timer = setTimeout(() => {
      const entry = prompts.get(value.requestId);
      if (entry && !entry.acknowledged)
        send({
          kind: "submission",
          event: {
            kind: "disconnected",
            submissionId: value.submissionId,
            requestId: value.requestId,
            target: value.target,
          },
        });
      if (entry) clearTimeout(entry.acknowledgementTimer);
      prompts.delete(value.requestId);
      projection?.accept({ type: "submission_correlation_expired" });
    }, 15 * 60_000);
    const acknowledgementTimer = setTimeout(() => {
      const entry = prompts.get(value.requestId);
      if (entry && !entry.acknowledged)
        send({
          kind: "submission",
          event: {
            kind: "disconnected",
            submissionId: value.submissionId,
            requestId: value.requestId,
            target: value.target,
          },
        });
    }, 30000);
    prompts.set(value.requestId, {
      value,
      acknowledged: false,
      timer,
      acknowledgementTimer,
    });
    busy = true;
    try {
      native.write(
        `${JSON.stringify({ id: value.requestId, type: "prompt", message: value.text, streamingBehavior: value.delivery ?? "followUp" })}\n`,
      );
    } catch {
      observe({ kind: "disconnected", reason: "write" });
    }
  }

  async function handle(
    command: HostCommand,
    port?: ReadingPort,
  ): Promise<void> {
    await match(command)
      .with({ kind: "attach" }, () => {
        readingPort?.close();
        readingPort = port ?? null;
        readingPort?.start();
        if (projection) readingPort?.postMessage(projection.snapshot());
        return Promise.resolve();
      })
      .with({ kind: "start" }, (value) => launch(value))
      .with({ kind: "dispatch" }, ({ value }) => {
        dispatch(value);
        return Promise.resolve();
      })
      .with({ kind: "answer" }, async ({ command }) => {
        if (
          !native ||
          !start ||
          command.threadId !== start.threadId ||
          command.generation !== start.connectionGeneration
        )
          return;
        const written = interactions.answer(
          command.id,
          command.answer,
          (frame) => native?.write(frame),
        );
        publishInteractions();
        send({
          kind: "operation-result",
          traceId: command.traceId,
          generation: command.generation,
          operation: "answer",
          status: written ? "acknowledged" : "unknown",
        });
        await refresh();
      })
      .with({ kind: "control" }, async ({ command }) => {
        if (
          !native ||
          !start ||
          command.threadId !== start.threadId ||
          command.generation !== start.connectionGeneration
        )
          return;
        const reply = await native.request(
          command.kind === "stop" ? "d_pi_stop" : "d_pi_continue",
          { traceId: command.traceId },
        );
        if (reply.success !== true) throw Error("Control failed");
        const control = ControlStateSchema.parse(reply.data);
        paused = control.paused;
        send({
          kind: "operation-result",
          traceId: command.traceId,
          generation: command.generation,
          operation: command.kind,
          status: "acknowledged",
        });
        send({
          kind: "control",
          generation: start.connectionGeneration,
          state: control,
        });
      })
      .with({ kind: "state" }, () => refresh())
      .with({ kind: "close-idle" }, async () => {
        if (start?.sdkEntry && native) {
          const latest = await native.request("d_pi_state");
          if (latest.success !== true) throw Error("Cannot verify shutdown");
          const actual = ControlStateSchema.parse(latest.data);
          if (
            actual.streaming ||
            actual.compacting ||
            actual.stopping ||
            actual.queued ||
            actual.background ||
            actual.pendingAsync ||
            actual.admitted
          ) {
            send({
              kind: "control",
              generation: start.connectionGeneration,
              state: actual,
            });
            send({ kind: "failed", code: "active-work" });
            return;
          }
        }
        if (busy || interactions.pending || starting) {
          send({ kind: "failed", code: "active-work" });
          return;
        }
        closing = true;
        await native?.close();
        clearPrompts();
        interactions.dispose();
        projection?.dispose();
        readingPort?.close();
        exit(0);
      })
      .exhaustive()
      .catch(async () => {
        if (command.kind === "answer" || command.kind === "control")
          send({
            kind: "operation-result",
            traceId: command.command.traceId,
            generation: command.command.generation,
            operation: command.command.kind,
            status: "unknown",
          });
        send({ kind: "failed", code: "runtime-unavailable" });
        if (command.kind === "start") {
          closing = true;
          await native?.close();
          clearPrompts();
          interactions.dispose();
          projection?.dispose();
          readingPort?.close();
          exit(1);
        }
      });
  }
  return { handle };
}

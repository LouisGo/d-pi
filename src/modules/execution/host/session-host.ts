import { randomUUID } from "node:crypto";
import { isAbsolute, relative } from "node:path";
import { match } from "ts-pattern";
import { identifyDirectory } from "../../../platform/node/filesystem/public";
import type { NativeFrame } from "../../../platform/omp/protocol/public";
import { type ControlState, ControlStateSchema } from "../contracts/control";
import { defaultAnswerFor } from "../contracts/interactions";
import type { FrozenSubmission } from "../contracts/public";
import {
  type HostCommand,
  type HostMessage,
  type HostStart,
  type HostSubmissionRejectionReason,
  type NativeState,
  NativeStateSchema,
} from "../contracts/public";
import { changesManagedSession } from "../core/public";
import { PendingInteractions } from "./interactions";
import { type NativeObservation, NativeSession } from "./native-session";

export interface HostMessagePort {
  start(): void;
  close(): void;
  postMessage(event: unknown): void;
}
export interface SessionHostSupervisionEvent {
  kind: "submission-correlation-expired";
  submissionId: FrozenSubmission["submissionId"];
  requestId: FrozenSubmission["requestId"];
  traceId: FrozenSubmission["traceId"];
}
export interface SessionHostOptions {
  onStart?: (value: HostStart) => void;
  onNativeFrame?: (frame: NativeFrame) => void;
  onSupervisionEvent?: (event: SessionHostSupervisionEvent) => void;
  onAttach?: (port?: HostMessagePort) => void;
  onDispose?: () => void;
}
export interface SessionHost {
  handle(command: HostCommand, port?: HostMessagePort): Promise<void>;
}
// One owner per utility instance. Merely importing this module creates no processes or listeners.
export function createSessionHost(
  send: (message: HostMessage) => void,
  exit: (code: number) => void,
  options: SessionHostOptions = {},
): SessionHost {
  let native: NativeSession | null = null;
  let start: HostStart | null = null;
  let state: NativeState | null = null;
  let busy = false;
  let paused = false;
  let lastControl: ControlState | null = null;
  let observationVersion = 0;
  let lastDispatchId: string | null = null;
  let disconnected = false;
  let refreshFlight: Promise<void> | null = null;
  const activeControl = (value: ControlState) =>
    !!(
      value.streaming ||
      value.compacting ||
      value.stopping ||
      value.queued ||
      value.background ||
      value.pendingAsync ||
      value.admitted
    );

  const interactions = new PendingInteractions(publishInteractions);
  // Timeout default answers (2026-09-28 user decision): confirm dialogs never
  // auto-answer; select/input/editor fall back to the product default so the
  // task keeps flowing. The native side honors the first response per id and
  // silently drops later ones, so a default once written cannot be withdrawn.
  const APP_DEFAULT_ANSWER_MS = 120_000;
  const NATIVE_EXPIRY_MARGIN_MS = 1_000;
  const defaultAnswerTimers = new Map<string, ReturnType<typeof setTimeout>>();
  function clearDefaultAnswerTimer(id: string): void {
    const timer = defaultAnswerTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      defaultAnswerTimers.delete(id);
    }
  }
  function clearDefaultAnswerTimers(): void {
    for (const timer of defaultAnswerTimers.values()) clearTimeout(timer);
    defaultAnswerTimers.clear();
  }
  async function fireDefaultAnswer(id: string): Promise<void> {
    if (closing || disconnected || !native || !start) return;
    const dialog = interactions.snapshot().find((item) => item.id === id);
    if (!dialog || dialog.status !== "pending" || dialog.method === "confirm")
      return;
    const answer = defaultAnswerFor(dialog);
    if (!answer) return;
    const traceId = randomUUID();
    // Single visible transition: sent+defaultAnswered together. Publishing an
    // intermediate sent without the flag would move the card to history and
    // unmount the editor, losing half-typed input on the next snapshot.
    const written = interactions.answerDefault(id, answer, (frame) =>
      native?.write(frame),
    );
    publishInteractions();
    // "acknowledged" here means written to the native pipe without a throw,
    // not native-confirmed (extension_ui_response has no ACK). Kept for
    // backward compatibility; do not expand this meaning to receipts.
    send({
      kind: "operation-result",
      traceId,
      generation: start.connectionGeneration,
      operation: "answer",
      status: written ? "acknowledged" : "unknown",
    });
    await refresh();
  }
  function reconcileDefaultAnswerTimers(): void {
    if (closing || disconnected || !native || !start) {
      clearDefaultAnswerTimers();
      return;
    }
    const pending = new Map(
      interactions
        .snapshot()
        .filter(
          (item) => item.status === "pending" && item.method !== "confirm",
        )
        .map((item) => [item.id, item] as const),
    );
    for (const id of [...defaultAnswerTimers.keys()])
      if (!pending.has(id)) clearDefaultAnswerTimer(id);
    for (const [id, dialog] of pending) {
      if (defaultAnswerTimers.has(id)) continue;
      // Answer ahead of a native expiry: once native deletes the request our
      // write would be silently dropped and the dialog only shows expired.
      // A native timeout is honored as given; the 120s App fallback applies
      // only when native carries no timeout field (2026-09-28 decision).
      const latest =
        dialog.expiresAt === null
          ? Date.now() + APP_DEFAULT_ANSWER_MS
          : dialog.expiresAt - NATIVE_EXPIRY_MARGIN_MS;
      const delay = Math.max(0, latest - Date.now());
      const timer = setTimeout(
        () => {
          defaultAnswerTimers.delete(id);
          void fireDefaultAnswer(id);
        },
        Math.min(delay, 2147483647),
      );
      timer.unref();
      defaultAnswerTimers.set(id, timer);
    }
  }
  function publishInteractions(): void {
    observationVersion++;
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
      responded: boolean;
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
  function disposeHost(): void {
    clearPrompts();
    clearDefaultAnswerTimers();
    interactions.dispose();
    options.onDispose?.();
  }
  function observe(event: NativeObservation): void {
    if (event.kind === "exited") {
      // The native child is confirmed dead. Release the remaining utility owner;
      // Main retains in-flight/interaction/background uncertainty independently.
      if (!closing) {
        closing = true;
        observationVersion++;
        disposeHost();
        exit(0);
      }
      return;
    }
    if (event.kind === "disconnected") {
      if (closing) return;
      disconnected = true;
      observationVersion++;
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
      clearDefaultAnswerTimers();
      send({ kind: "interrupted", reason: event.reason });
      return;
    }
    if (disconnected || closing) return;
    const frame = event.frame;
    if (frame.type === "d_pi_control_state" && start) {
      const control = ControlStateSchema.safeParse(frame.data);
      if (control.success) {
        observationVersion++;
        paused = control.data.paused;
        lastControl = control.data;
        send({
          kind: "control",
          generation: start.connectionGeneration,
          state: control.data,
        });
        if (!activeControl(control.data)) void refresh();
      }
    }
    if (frame.type !== "d_pi_control_state") options.onNativeFrame?.(frame);
    if (frame.type === "agent_start") {
      observationVersion++;
      busy = true;
    }
    if (frame.type === "agent_end" && frame.isTerminal !== false) {
      observationVersion++;
      busy = false;
      void refresh();
    }
    const hadInteraction = interactions.pending;
    interactions.update(frame);
    if (frame.type === "extension_ui_request" || frame.type.startsWith("host_"))
      publishInteractions();
    reconcileDefaultAnswerTimers();
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
        observationVersion++;
        clearTimeout(entry.acknowledgementTimer);
        entry.responded = true;
        send({
          kind: "submission",
          event: {
            kind: frame.success ? "ack" : "error",
            submissionId: entry.value.submissionId,
            requestId: entry.value.requestId,
            target: entry.value.target,
          },
        });
        // ACK is not completion. Query after this observation to establish whether
        // native admission/queues/background activity have actually drained.
        void refresh();
      }
    }
    if (frame.type === "prompt_result" && frame.agentInvoked === false) {
      observationVersion++;
      busy = false;
      void refresh();
    }
    // Reading events go directly to the Renderer port; Main receives supervision only.
  }
  function refresh(): Promise<void> {
    if (refreshFlight) return refreshFlight;
    if (disconnected || closing) return Promise.resolve();
    refreshFlight = refreshState().finally(() => {
      refreshFlight = null;
    });
    return refreshFlight;
  }
  async function refreshState(): Promise<void> {
    try {
      while (!disconnected && !closing) {
        const version = observationVersion;
        const afterSubmissionId = lastDispatchId;
        const response = await native?.request("get_state");
        if (disconnected || closing) return;
        if (version !== observationVersion) continue;
        if (response?.success !== true) throw Error("Native state unavailable");
        const next = NativeStateSchema.parse(response.data);
        let control: ControlState | null = null;
        if (start?.sdkEntry) {
          const reply = await native?.request("d_pi_state");
          if (disconnected || closing) return;
          if (version !== observationVersion) continue;
          if (reply?.success !== true)
            throw Error("Native control unavailable");
          control = ControlStateSchema.parse(reply.data);
        }
        state = next;
        busy =
          next.isStreaming ||
          next.isCompacting ||
          next.queuedMessageCount > 0 ||
          !!(control && activeControl(control));
        if (control && start) {
          paused = control.paused;
          lastControl = control;
          send({
            kind: "control",
            generation: start.connectionGeneration,
            state: control,
          });
        }
        send({
          kind: "state",
          state,
          pendingInteraction: interactions.pending,
          busy,
        });
        if (
          !busy &&
          !interactions.pending &&
          start &&
          [...prompts.values()].every((entry) => entry.responded)
        )
          send({
            kind: "idle-confirmed",
            generation: start.connectionGeneration,
            afterSubmissionId,
          });
        return;
      }
    } catch {
      if (!disconnected && !closing)
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
      options.onStart?.(value);
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
  function dispatchRejectionReason(
    value: FrozenSubmission,
  ): HostSubmissionRejectionReason | null {
    if (!start || !state || !state.model) return "not-ready";
    if (!native || disconnected || closing) return "native-unavailable";
    if (changesManagedSession(value.text)) return "unsupported-native-command";
    if (paused) return "paused";
    if (interactions.blocked) return "interaction-pending";
    if (
      value.threadId !== start.threadId ||
      value.target.processInstanceId !== start.processInstanceId ||
      value.target.connectionGeneration !== start.connectionGeneration ||
      value.target.configContextId !== start.configContextId ||
      value.target.nativeSessionRef !== state.sessionFile
    )
      return "stale-target";
    if (prompts.size >= 128) return "correlation-limit";
    return null;
  }
  function dispatch(value: FrozenSubmission): void {
    if (prompts.has(value.requestId)) return;
    observationVersion++;
    if (value.target.connectionGeneration === start?.connectionGeneration)
      lastDispatchId = value.submissionId;
    const rejectionReason = dispatchRejectionReason(value);
    if (rejectionReason) {
      send({
        kind: "submission",
        event: {
          kind: "rejected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
          reason: rejectionReason,
        },
      });
      void refresh();
      return;
    }
    if (!native) return;
    const timer = setTimeout(() => {
      const entry = prompts.get(value.requestId);
      if (entry && !entry.responded)
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
      options.onSupervisionEvent?.({
        kind: "submission-correlation-expired",
        submissionId: value.submissionId,
        requestId: value.requestId,
        traceId: value.traceId,
      });
    }, 15 * 60_000);
    const acknowledgementTimer = setTimeout(() => {
      const entry = prompts.get(value.requestId);
      if (entry && !entry.responded)
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
      responded: false,
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
    port?: HostMessagePort,
  ): Promise<void> {
    await match(command)
      .with({ kind: "attach" }, () => {
        options.onAttach?.(port);
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
        clearDefaultAnswerTimer(command.id);
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
      .with({ kind: "dismiss" }, ({ command }) => {
        // Local cleanup for unknown/expired dialogs. No native write is
        // claimed; it only releases the canSubmit/dispatch/quit block so one
        // failed default cannot wedge the session. Works while disconnected.
        if (
          !start ||
          command.threadId !== start.threadId ||
          command.generation !== start.connectionGeneration
        )
          return Promise.resolve();
        const dismissed = interactions.dismiss(command.id);
        clearDefaultAnswerTimer(command.id);
        publishInteractions();
        send({
          kind: "operation-result",
          traceId: command.traceId,
          generation: command.generation,
          operation: "dismiss",
          status: dismissed ? "acknowledged" : "unknown",
        });
        return refresh();
      })
      .with({ kind: "control" }, async ({ command }) => {
        if (
          !native ||
          !start ||
          command.threadId !== start.threadId ||
          command.generation !== start.connectionGeneration
        )
          return;
        const version = ++observationVersion;
        const reply = await native.request(
          command.kind === "stop" ? "d_pi_stop" : "d_pi_continue",
          { traceId: command.traceId },
        );
        if (disconnected || closing) return;
        if (reply.success !== true) {
          send({
            kind: "operation-result",
            traceId: command.traceId,
            generation: command.generation,
            operation: command.kind,
            status: "failed",
          });
          return;
        }
        const control = ControlStateSchema.parse(reply.data);
        // Keep the last known control fresh: the close-idle fallback without
        // a live query reads it, so a stale active value would refuse an idle
        // close (and vice versa) after stop/continue changed the state.
        if (version === observationVersion) {
          paused = control.paused;
          lastControl = control;
        }
        send({
          kind: "operation-result",
          traceId: command.traceId,
          generation: command.generation,
          operation: command.kind,
          status: "acknowledged",
        });
        if (version === observationVersion)
          send({
            kind: "control",
            generation: start.connectionGeneration,
            state: control,
          });
        await refresh();
      })
      .with({ kind: "state" }, () => refresh())
      .with({ kind: "close-idle" }, async () => {
        if (closing || disconnected) return;
        const version = observationVersion;
        if (start?.sdkEntry && native) {
          const latest = await native.request("d_pi_state");
          if (closing || disconnected) return;
          if (version !== observationVersion) {
            // A later native observation invalidates this shutdown evidence too.
            send({ kind: "failed", code: "active-work" });
            void refresh();
            return;
          }
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
        if (
          busy ||
          interactions.blocked ||
          starting ||
          (lastControl ? activeControl(lastControl) : false)
        ) {
          send({ kind: "failed", code: "active-work" });
          return;
        }
        closing = true;
        await native?.close();
        disposeHost();
        exit(0);
      })
      .exhaustive()
      .catch(async () => {
        if (closing || disconnected) return;
        if (
          command.kind === "answer" ||
          command.kind === "dismiss" ||
          command.kind === "control"
        )
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
          disposeHost();
          exit(1);
        }
      });
  }
  return { handle };
}

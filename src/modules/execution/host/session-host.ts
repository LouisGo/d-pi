import { randomUUID } from "node:crypto";
import { isAbsolute, relative } from "node:path";
import { match } from "ts-pattern";
import { identifyDirectory } from "../../../platform/node/filesystem/public";
import {
  isNativeFrameType,
  type NativeFrame,
  NativeFrameTypes,
} from "../../../platform/omp/protocol/public";
import { SubagentConfigurationSnapshotSchema } from "../../configuration/contracts/public";
import { type ControlState, ControlStateSchema } from "../contracts/control";
import { defaultAnswerFor } from "../contracts/interactions";
import type { FrozenSubmission, SubmissionEvent } from "../contracts/public";
import {
  type HostCommand,
  type HostMessage,
  type HostStart,
  type NativeState,
  NativeStateSchema,
  type SubmissionRejectionReason,
} from "../contracts/public";
import { QueueSnapshotSchema } from "../contracts/queue";
import { changesManagedSession } from "../core/public";
import { PendingInteractions } from "./interactions/interactions";
import { type NativeObservation, NativeSession } from "./native/native-session";

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
  let permit: ((allowed: boolean) => void) | null = null;
  let state: NativeState | null = null;
  let busy = false;
  let unsettledPrompt = false;
  let paused = false;
  let lastControl: ControlState | null = null;
  let observationVersion = 0;
  let lastDispatchId: string | null = null;
  let disconnected = false;
  let successfulRefresh = 0;
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
      connectionGeneration: start.connectionGeneration,
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
          connectionGeneration: start.connectionGeneration,
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
      responseConfirmed: boolean;
      accepted: boolean;
      terminalConfirmed: boolean;
      timer: ReturnType<typeof setTimeout>;
      acknowledgementTimer: ReturnType<typeof setTimeout>;
    }
  >();
  // Keep only recent confirmed identities, never their frozen text. Native late
  // duplicates and errors still belong to the same submission after Main commits.
  const confirmedPrompts = new Map<
    string,
    {
      value: Pick<FrozenSubmission, "submissionId" | "requestId" | "target">;
      at: number;
    }
  >();
  function promptIdentity(requestId: string) {
    const now = Date.now();
    for (const [id, entry] of confirmedPrompts)
      if (now - entry.at >= 15 * 60_000) confirmedPrompts.delete(id);
    const value =
      prompts.get(requestId)?.value ?? confirmedPrompts.get(requestId)?.value;
    return value
      ? {
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        }
      : undefined;
  }
  function rememberConfirmed(value: FrozenSubmission): void {
    confirmedPrompts.set(value.requestId, {
      value: {
        submissionId: value.submissionId,
        requestId: value.requestId,
        target: value.target,
      },
      at: Date.now(),
    });
    if (confirmedPrompts.size > 128) {
      const oldest = confirmedPrompts.keys().next().value;
      if (oldest) confirmedPrompts.delete(oldest);
    }
  }
  // Only evidence is replayed; frozen prompts are never written again.
  const evidence = new Map<string, SubmissionEvent>();
  let evidenceRetry: ReturnType<typeof setTimeout> | null = null;
  let retryDelay = 1000;
  function replayEvidence(): void {
    for (const [evidenceId, event] of evidence)
      send({ kind: "submission", evidenceId, event });
  }
  function scheduleEvidenceRetry(): void {
    if (!evidence.size || evidenceRetry || disconnected || closing) return;
    evidenceRetry = setTimeout(() => {
      evidenceRetry = null;
      replayEvidence();
      retryDelay = Math.min(retryDelay * 2, 30000);
      scheduleEvidenceRetry();
    }, retryDelay);
    evidenceRetry.unref();
  }
  function publishEvidence(event: SubmissionEvent): void {
    for (const [evidenceId, previous] of evidence) {
      if (
        previous.requestId === event.requestId &&
        previous.kind === event.kind &&
        (previous.kind !== "prompt-result" ||
          event.kind !== "prompt-result" ||
          previous.status === event.status)
      ) {
        send({ kind: "submission", evidenceId, event: previous });
        return;
      }
    }
    if (evidence.size >= 256) {
      if (start)
        send({
          kind: "evidence-gap",
          connectionGeneration: start.connectionGeneration,
          reason: "cache-full",
        });
      return;
    }
    const evidenceId = randomUUID();
    evidence.set(evidenceId, event);
    send({ kind: "submission", evidenceId, event });
    scheduleEvidenceRetry();
  }
  function clearPrompts(): void {
    for (const entry of prompts.values()) {
      clearTimeout(entry.timer);
      clearTimeout(entry.acknowledgementTimer);
    }
    prompts.clear();
    confirmedPrompts.clear();
  }
  function disposeHost(): void {
    permit?.(false);
    permit = null;
    clearPrompts();
    if (evidenceRetry) clearTimeout(evidenceRetry);
    evidenceRetry = null;
    evidence.clear();
    clearDefaultAnswerTimers();
    interactions.dispose();
    options.onDispose?.();
  }
  function observe(event: NativeObservation): void {
    if (event.kind === "exited") {
      if (event.evidence && start)
        send({
          kind: "process-exit",
          connectionGeneration: start.connectionGeneration,
          evidence: event.evidence,
        });
      if (event.groupStopped === false)
        send({ kind: "interrupted", reason: "process-group-unconfirmed" });
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
        publishEvidence({
          kind: "disconnected",
          submissionId: entry.value.submissionId,
          requestId: entry.value.requestId,
          target: entry.value.target,
        });
      clearPrompts();
      interactions.disconnect();
      clearDefaultAnswerTimers();
      send({ kind: "interrupted", reason: event.reason });
      return;
    }
    if (disconnected || closing) return;
    const frame = event.frame;
    if (isNativeFrameType(frame, NativeFrameTypes.dPiControlState) && start) {
      const control = ControlStateSchema.safeParse(frame.data);
      if (control.success) {
        observationVersion++;
        paused = control.data.paused;
        lastControl = control.data;
        send({
          kind: "control",
          connectionGeneration: start.connectionGeneration,
          state: control.data,
        });
        if (!activeControl(control.data)) void refresh();
      }
    }
    if (!isNativeFrameType(frame, NativeFrameTypes.dPiControlState))
      options.onNativeFrame?.(frame);
    if (isNativeFrameType(frame, NativeFrameTypes.agentStart)) {
      observationVersion++;
      busy = true;
    }
    if (
      isNativeFrameType(frame, NativeFrameTypes.agentEnd) &&
      frame.isTerminal !== false
    ) {
      observationVersion++;
      busy = false;
      void refresh();
    }
    const hadInteraction = interactions.pending;
    interactions.update(frame);
    if (
      isNativeFrameType(
        frame,
        NativeFrameTypes.extensionUiRequest,
        NativeFrameTypes.hostToolCancel,
        NativeFrameTypes.hostUriCancel,
        NativeFrameTypes.hostToolCall,
        NativeFrameTypes.hostUriRequest,
      )
    )
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
      isNativeFrameType(frame, NativeFrameTypes.response) &&
      typeof frame.id === "string" &&
      frame.command === "prompt"
    ) {
      const entry = prompts.get(frame.id);
      const value = promptIdentity(frame.id);
      if (value && typeof frame.success === "boolean") {
        observationVersion++;
        if (entry) {
          clearTimeout(entry.acknowledgementTimer);
          entry.responded = true;
          entry.accepted ||= frame.success;
        }
        publishEvidence({
          kind: frame.success ? "ack" : "error",
          ...value,
        });
        if (
          frame.success &&
          frame.data &&
          typeof frame.data === "object" &&
          "agentInvoked" in frame.data &&
          frame.data.agentInvoked === false
        ) {
          publishEvidence({
            kind: "local-result",
            ...value,
          });
        }
        // ACK is not completion. Query after this observation to establish whether
        // native admission/queues/background activity have actually drained.
        void refresh();
      }
    }
    if (isNativeFrameType(frame, NativeFrameTypes.promptResult)) {
      observationVersion++;
      const value = frame.id ? promptIdentity(frame.id) : undefined;
      if (value) {
        publishEvidence({
          kind: "prompt-result",
          ...value,
          status: frame.status,
          agentInvoked: frame.agentInvoked,
          sessionSettled: frame.sessionSettled,
          ...(frame.error
            ? {
                error: {
                  code: "native-error",
                  retryable: frame.error.retryable,
                  ...(frame.error.httpStatus &&
                  frame.error.httpStatus >= 100 &&
                  frame.error.httpStatus <= 599
                    ? { httpStatus: frame.error.httpStatus }
                    : {}),
                },
              }
            : {}),
        });
      } else {
        // A terminal without App correlation is never assigned to another prompt.
        send({
          kind: "evidence-gap",
          connectionGeneration: start?.connectionGeneration ?? randomUUID(),
          reason: "uncorrelated-result",
        });
      }
      // Prompt completion is independent from session/background activity.
      unsettledPrompt = !frame.sessionSettled;
      busy = unsettledPrompt;
      void refresh();
    }
    if (isNativeFrameType(frame, NativeFrameTypes.sessionSettled)) {
      observationVersion++;
      unsettledPrompt = false;
      busy = false;
      void refresh();
    }
    if (isNativeFrameType(frame, NativeFrameTypes.queueUpdate)) {
      observationVersion++;
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
          const subagentReply = await native?.request("d_pi_subagent_state");
          if (disconnected || closing) return;
          if (version !== observationVersion) continue;
          if (subagentReply?.success !== true)
            throw Error("Native subagent configuration unavailable");
          send({
            kind: "subagents",
            connectionGeneration: start.connectionGeneration,
            state: SubagentConfigurationSnapshotSchema.parse(
              subagentReply.data,
            ),
          });
        }
        state = next;
        if (next.isSettled !== undefined) unsettledPrompt = !next.isSettled;
        busy =
          unsettledPrompt ||
          next.hasPendingAsyncWork === true ||
          next.isStreaming ||
          next.isCompacting ||
          next.queuedMessageCount > 0 ||
          !!(control && activeControl(control));
        if (control && start) {
          paused = control.paused;
          lastControl = control;
          send({
            kind: "control",
            connectionGeneration: start.connectionGeneration,
            state: control,
          });
        }
        successfulRefresh++;
        send({
          kind: "state",
          state,
          pendingInteraction: interactions.pending,
          busy,
        });
        if (!busy && !interactions.pending && start && prompts.size === 0)
          send({
            kind: "idle-confirmed",
            connectionGeneration: start.connectionGeneration,
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
          ...(value.supervision
            ? {
                supervision: value.supervision,
                register: async (identity) => {
                  const result = new Promise<boolean>((resolve) => {
                    permit = resolve;
                  });
                  send({
                    kind: "native-register",
                    registration: {
                      ...identity,
                      processInstanceId: value.processInstanceId,
                      token: value.supervision?.token ?? "",
                    },
                  });
                  return result;
                },
              }
            : {}),
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
  ): SubmissionRejectionReason | null {
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
    if (promptIdentity(value.requestId)) return;
    observationVersion++;
    if (value.target.connectionGeneration === start?.connectionGeneration)
      lastDispatchId = value.submissionId;
    const rejectionReason = dispatchRejectionReason(value);
    if (rejectionReason) {
      publishEvidence({
        kind: "rejected",
        submissionId: value.submissionId,
        requestId: value.requestId,
        target: value.target,
        reason: rejectionReason,
      });
      void refresh();
      return;
    }
    if (!native) return;
    const timer = setTimeout(() => {
      const entry = prompts.get(value.requestId);
      if (entry && !entry.responded)
        publishEvidence({
          kind: "disconnected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        });
      if (entry) clearTimeout(entry.acknowledgementTimer);
      prompts.delete(value.requestId);
      if (start)
        send({
          kind: "evidence-gap",
          connectionGeneration: start.connectionGeneration,
          reason: "correlation-expired",
        });
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
        publishEvidence({
          kind: "disconnected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        });
    }, 30000);
    prompts.set(value.requestId, {
      value,
      responded: false,
      responseConfirmed: false,
      accepted: false,
      terminalConfirmed: false,
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
      .with({ kind: "native-permit" }, (value) => {
        if (
          value.processInstanceId === start?.processInstanceId &&
          value.token === start.supervision?.token
        ) {
          permit?.(value.allowed);
          permit = null;
        }
        return Promise.resolve();
      })
      .with({ kind: "attach" }, () => {
        options.onAttach?.(port);
        replayEvidence();
        return Promise.resolve();
      })
      .with({ kind: "replay-evidence" }, () => {
        replayEvidence();
        return Promise.resolve();
      })
      .with(
        { kind: "confirm-evidence" },
        ({ evidenceId, connectionGeneration }) => {
          if (connectionGeneration === start?.connectionGeneration) {
            const event = evidence.get(evidenceId);
            evidence.delete(evidenceId);
            const entry = event ? prompts.get(event.requestId) : undefined;
            if (entry && event) {
              if (event.kind === "ack") entry.responseConfirmed = true;
              if (
                event.kind === "prompt-result" ||
                event.kind === "local-result"
              )
                entry.terminalConfirmed = true;
              if (event.kind === "error") {
                entry.responseConfirmed = true;
                // 18.4.6 still emits ACK -> late response error -> prompt_result.
                // Keep accepted request correlation until its native result arrives.
                if (!entry.accepted) entry.terminalConfirmed = true;
              }
              if (entry.responseConfirmed && entry.terminalConfirmed) {
                clearTimeout(entry.timer);
                clearTimeout(entry.acknowledgementTimer);
                rememberConfirmed(entry.value);
                prompts.delete(event.requestId);
                // Main may confirm after the terminal's idle sample finished.
                // Re-sample when the final durable correlation is released.
                void refresh();
              }
            }
          }
          if (!evidence.size && evidenceRetry) {
            clearTimeout(evidenceRetry);
            evidenceRetry = null;
            retryDelay = 1000;
          }
          return Promise.resolve();
        },
      )
      .with({ kind: "start" }, (value) => launch(value))
      .with({ kind: "dispatch" }, ({ value }) => {
        dispatch(value);
        return Promise.resolve();
      })
      .with(
        { kind: "manage-queue" },
        { kind: "configure-subagent" },
        async ({ kind, command }) => {
          if (
            !native ||
            !start ||
            disconnected ||
            closing ||
            command.threadId !== start.threadId ||
            command.connectionGeneration !== start.connectionGeneration
          )
            return;
          let status: "acknowledged" | "failed" | "unknown" = "unknown";
          let code: string | undefined;
          try {
            const response = await native.request(
              kind === "manage-queue" ? "d_pi_queue" : "d_pi_subagent_config",
              { command: command.command },
            );
            if (disconnected || closing) return;
            if (response.success === true) {
              if (kind === "manage-queue") {
                const snapshot = QueueSnapshotSchema.parse(response.data);
                if (!lastControl) await refresh();
                if (!lastControl) throw Error("Native control unavailable");
                send({
                  kind: "control",
                  connectionGeneration: start.connectionGeneration,
                  state: { ...lastControl, queueState: snapshot },
                });
              } else
                send({
                  kind: "subagents",
                  connectionGeneration: start.connectionGeneration,
                  state: SubagentConfigurationSnapshotSchema.parse(
                    response.data,
                  ),
                });
              status = "acknowledged";
            } else {
              status =
                response.error === "native-operation-failed"
                  ? "unknown"
                  : "failed";
              if (
                typeof response.error === "string" &&
                /^[a-z0-9-]{1,64}$/.test(response.error)
              )
                code = response.error;
            }
            await refresh();
          } catch {
            status = "unknown";
          }
          send({
            kind: "operation-result",
            traceId: command.traceId,
            connectionGeneration: command.connectionGeneration,
            operation: kind,
            status,
            ...(code ? { code } : {}),
          });
        },
      )
      .with(
        { kind: "select-model" },
        async ({ command, connectionGeneration }) => {
          if (
            !native ||
            !start ||
            command.threadId !== start.threadId ||
            connectionGeneration !== start.connectionGeneration
          )
            return;
          let status: "acknowledged" | "failed" | "unknown" = "unknown";
          try {
            if (
              busy ||
              prompts.size > 0 ||
              interactions.pending ||
              (lastControl && activeControl(lastControl))
            )
              throw Error("Active Thread");
            const result = await native.request(
              "d_pi_model",
              command.selection,
            );
            status = result.success === true ? "acknowledged" : "failed";
            await refresh();
          } catch {
            status = "unknown";
          }
          send({
            kind: "operation-result",
            traceId: command.traceId,
            connectionGeneration,
            operation: "select-model",
            status,
          });
        },
      )
      .with({ kind: "answer" }, async ({ command }) => {
        if (
          !native ||
          !start ||
          command.threadId !== start.threadId ||
          command.connectionGeneration !== start.connectionGeneration
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
          connectionGeneration: command.connectionGeneration,
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
          command.connectionGeneration !== start.connectionGeneration
        )
          return Promise.resolve();
        const dismissed = interactions.dismiss(command.id);
        clearDefaultAnswerTimer(command.id);
        publishInteractions();
        send({
          kind: "operation-result",
          traceId: command.traceId,
          connectionGeneration: command.connectionGeneration,
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
          command.connectionGeneration !== start.connectionGeneration
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
            connectionGeneration: command.connectionGeneration,
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
          connectionGeneration: command.connectionGeneration,
          operation: command.kind,
          status: "acknowledged",
        });
        if (version === observationVersion)
          send({
            kind: "control",
            connectionGeneration: start.connectionGeneration,
            state: control,
          });
        await refresh();
      })
      .with({ kind: "state" }, async (command) => {
        const version = successfulRefresh;
        await refresh();
        if (
          command.traceId &&
          command.connectionGeneration &&
          command.connectionGeneration === start?.connectionGeneration
        )
          send({
            kind: "operation-result",
            traceId: command.traceId,
            connectionGeneration: command.connectionGeneration,
            operation: "inspect",
            status:
              successfulRefresh > version && !disconnected && !closing
                ? "acknowledged"
                : "unknown",
          });
      })
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
              connectionGeneration: start.connectionGeneration,
              state: actual,
            });
            send({ kind: "failed", code: "active-work" });
            return;
          }
        }
        if (
          evidence.size > 0 ||
          prompts.size > 0 ||
          unsettledPrompt ||
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
            connectionGeneration: command.command.connectionGeneration,
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

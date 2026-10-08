import { randomUUID } from "node:crypto";
import { isAbsolute, relative } from "node:path";
import { match } from "ts-pattern";
import { z } from "zod";
import { identifyDirectory } from "../../../platform/node/filesystem/public";
import {
  isNativeFrameType,
  type NativeFrame,
  NativeFrameTypes,
} from "../../../platform/omp/protocol/public";
import { SubagentConfigurationSnapshotSchema } from "../../configuration/contracts/public";
import { type ControlState, ControlStateSchema } from "../contracts/control";
import { defaultAnswerFor } from "../contracts/interactions";
import type { NativeFailureSummary } from "../contracts/native-failure";
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
import { changesManagedSession, submissionFrame } from "../core/public";
import { HostScope, type ScopedDeadline } from "./host-scope";
import { PendingInteractions } from "./interactions/interactions";
import { nativeData, nativeFailureOf } from "./native/native-request-failure";
import { type NativeObservation, NativeSession } from "./native/native-session";
import { NativeSubagentObservation } from "./native/subagent-observation";

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
// One owner per native instance scope. Importing creates no processes or listeners.
export function createSessionHost(
  send: (message: HostMessage) => void,
  exit: (code: number) => void,
  options: SessionHostOptions = {},
): SessionHost {
  const failureFields = (error: unknown) => {
    const nativeFailure = nativeFailureOf(error);
    return nativeFailure ? { nativeFailure } : {};
  };
  const tasks = new HostScope((error) => {
    if (!closing && !disconnected)
      send({
        kind: "failed",
        code: "runtime-unavailable",
        ...failureFields(error),
      });
  });
  let native: NativeSession | null = null;
  let subagentObservation: NativeSubagentObservation | null = null;
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
  const defaultAnswerTimers = new Map<string, ScopedDeadline>();
  function clearDefaultAnswerTimer(id: string): void {
    const timer = defaultAnswerTimers.get(id);
    if (timer) {
      timer.cancel();
      defaultAnswerTimers.delete(id);
    }
  }
  function clearDefaultAnswerTimers(): void {
    for (const timer of defaultAnswerTimers.values()) timer.cancel();
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
      const timer = tasks.deadline(
        Math.min(delay, 2147483647),
        async () => {
          defaultAnswerTimers.delete(id);
          await fireDefaultAnswer(id);
        },
        true,
      );
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
      timer: ScopedDeadline;
      acknowledgementTimer: ScopedDeadline;
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
  let evidenceRetry: ScopedDeadline | null = null;
  let retryDelay = 1000;
  function replayEvidence(): void {
    for (const [evidenceId, event] of evidence)
      send({ kind: "submission", evidenceId, event });
  }
  function scheduleEvidenceRetry(): void {
    if (!evidence.size || evidenceRetry || disconnected || closing) return;
    evidenceRetry = tasks.deadline(
      retryDelay,
      () => {
        evidenceRetry = null;
        if (disconnected || closing || !evidence.size) return;
        replayEvidence();
        retryDelay = Math.min(retryDelay * 2, 30000);
        scheduleEvidenceRetry();
      },
      true,
    );
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
      entry.timer.cancel();
      entry.acknowledgementTimer.cancel();
    }
    prompts.clear();
    confirmedPrompts.clear();
  }
  function disposeHost(): void {
    void tasks.close();
    subagentObservation?.dispose();
    subagentObservation = null;
    permit?.(false);
    permit = null;
    clearPrompts();
    if (evidenceRetry) evidenceRetry.cancel();
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
      void tasks.close();
      if (subagentObservation) {
        subagentObservation.dispose();
        options.onNativeFrame?.({
          type: "d_pi_subagent_observation_unavailable",
        });
      }
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
      send({
        kind: "interrupted",
        reason: event.reason,
        ...(event.failure ? { nativeFailure: event.failure } : {}),
      });
      return;
    }
    if (disconnected || closing) return;
    const frame = event.frame;
    subagentObservation?.accept(frame);
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
          entry.acknowledgementTimer.cancel();
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
    refreshFlight = tasks
      .run((signal) => refreshState(signal))
      .catch((error: unknown) => {
        if (!disconnected && !closing)
          send({
            kind: "interrupted",
            reason: "state-unavailable",
            ...failureFields(error),
          });
      })
      .finally(() => {
        refreshFlight = null;
      });
    return refreshFlight;
  }
  async function refreshState(signal: AbortSignal): Promise<void> {
    while (!disconnected && !closing) {
      const version = observationVersion;
      const afterSubmissionId = lastDispatchId;
      const response = await native?.request("get_state", {}, { signal });
      if (disconnected || closing) return;
      if (version !== observationVersion) continue;
      if (response?.success !== true) throw Error("Native state unavailable");
      const next = nativeData(NativeStateSchema, response, "get_state");
      let control: ControlState | null = null;
      if (start?.sdkEntry) {
        const reply = await native?.request("d_pi_state", {}, { signal });
        if (disconnected || closing) return;
        if (version !== observationVersion) continue;
        if (reply?.success !== true) throw Error("Native control unavailable");
        control = nativeData(ControlStateSchema, reply, "d_pi_state");
        const subagentReply = await native?.request(
          "d_pi_subagent_state",
          {},
          { signal },
        );
        if (disconnected || closing) return;
        if (version !== observationVersion) continue;
        if (subagentReply?.success !== true)
          throw Error("Native subagent configuration unavailable");
        send({
          kind: "subagents",
          connectionGeneration: start.connectionGeneration,
          state: nativeData(
            SubagentConfigurationSnapshotSchema,
            subagentReply,
            "d_pi_subagent_state",
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
          ...(value.resume ? { resume: value.resume } : {}),
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
      if (value.sdkEntry) {
        const instance = native;
        subagentObservation = new NativeSubagentObservation(
          (type, payload) =>
            tasks.run((signal) => instance.request(type, payload, { signal })),
          (frame) => {
            if (!disconnected && !closing) options.onNativeFrame?.(frame);
          },
        );
        await subagentObservation.start();
      }
      await refresh();
      if (!state?.sessionFile)
        throw Error("Native session reference unavailable");
      const within = relative(value.sessionDirectory, state.sessionFile);
      if (within.startsWith("..") || isAbsolute(within))
        throw Error("Unmanaged native session reference");
      if (value.resume) {
        if (
          state.sessionFile !== value.resume.sessionFile ||
          state.sessionId !== value.resume.sessionId
        )
          throw Error("Recovered native session identity conflict");
        // Rebuild the same native branch before enabling new input. This is a read,
        // not a replay of prompts or a claim about old unknown submission receipts.
        if (options.onNativeFrame) {
          const instance = native;
          let cursor: string | undefined;
          let count = 0;
          let total: number | undefined;
          do {
            const response = await tasks.run((signal) =>
              instance.request(
                "get_messages_page",
                { limit: 100, ...(cursor ? { cursor } : {}) },
                { signal },
              ),
            );
            const page = nativeData(
              z.object({
                messages: z.array(
                  z.looseObject({ role: z.string(), content: z.unknown() }),
                ),
                nextCursor: z.string().optional(),
                totalMessages: z.number().int().nonnegative(),
              }),
              response,
              "get_messages_page",
            );
            if (
              (total !== undefined && total !== page.totalMessages) ||
              (page.nextCursor &&
                (page.nextCursor === cursor || !page.messages.length))
            )
              throw Error("Native resume reading snapshot changed");
            total = page.totalMessages;
            for (const message of page.messages)
              options.onNativeFrame({
                type: NativeFrameTypes.messageEnd,
                message,
              });
            count += page.messages.length;
            if (count > total)
              throw Error("Invalid native resume reading count");
            cursor = page.nextCursor;
          } while (cursor);
          if (count !== total) throw Error("Native resume reading incomplete");
        }
      }
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
    if (value.content?.images.length && !lastControl?.imageSupport)
      return "image-unsupported";
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
    const timer = tasks.deadline(15 * 60_000, () => {
      if (closing || disconnected) return;
      const entry = prompts.get(value.requestId);
      if (entry && !entry.responded)
        publishEvidence({
          kind: "disconnected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        });
      if (entry) entry.acknowledgementTimer.cancel();
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
    });
    const acknowledgementTimer = tasks.deadline(30000, () => {
      if (closing || disconnected) return;
      const entry = prompts.get(value.requestId);
      if (entry && !entry.responded)
        publishEvidence({
          kind: "disconnected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        });
    });
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
      native.write(submissionFrame(value));
    } catch (error: unknown) {
      const failure = nativeFailureOf(error);
      observe({
        kind: "disconnected",
        reason: "write",
        ...(failure ? { failure } : {}),
      });
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
                entry.timer.cancel();
                entry.acknowledgementTimer.cancel();
                rememberConfirmed(entry.value);
                prompts.delete(event.requestId);
                // Main may confirm after the terminal's idle sample finished.
                // Re-sample when the final durable correlation is released.
                void refresh();
              }
            }
          }
          if (!evidence.size && evidenceRetry) {
            evidenceRetry.cancel();
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
          let nativeFailure: NativeFailureSummary | undefined;
          try {
            const instance = native;
            const response = await tasks.run((signal) =>
              instance.request(
                kind === "manage-queue" ? "d_pi_queue" : "d_pi_subagent_config",
                { command: command.command },
                { signal },
              ),
            );
            if (disconnected || closing) return;
            if (response.success === true) {
              if (kind === "manage-queue") {
                const snapshot = nativeData(
                  QueueSnapshotSchema,
                  response,
                  "d_pi_queue",
                );
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
                  state: nativeData(
                    SubagentConfigurationSnapshotSchema,
                    response,
                    "d_pi_subagent_config",
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
          } catch (error: unknown) {
            status = "unknown";
            nativeFailure = nativeFailureOf(error);
          }
          send({
            kind: "operation-result",
            traceId: command.traceId,
            connectionGeneration: command.connectionGeneration,
            operation: kind,
            status,
            ...(code ? { code } : {}),
            ...(nativeFailure ? { nativeFailure } : {}),
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
          let nativeFailure: NativeFailureSummary | undefined;
          try {
            if (
              busy ||
              prompts.size > 0 ||
              interactions.pending ||
              (lastControl && activeControl(lastControl))
            )
              throw Error("Active Thread");
            const instance = native;
            const result = await tasks.run((signal) =>
              instance.request("d_pi_model", command.selection, { signal }),
            );
            status = result.success === true ? "acknowledged" : "failed";
            await refresh();
          } catch (error: unknown) {
            status = "unknown";
            nativeFailure = nativeFailureOf(error);
          }
          send({
            kind: "operation-result",
            traceId: command.traceId,
            connectionGeneration,
            operation: "select-model",
            status,
            ...(nativeFailure ? { nativeFailure } : {}),
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
        const instance = native;
        const reply = await tasks.run((signal) =>
          instance.request(
            command.kind === "stop" ? "d_pi_stop" : "d_pi_continue",
            { traceId: command.traceId },
            { signal },
          ),
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
        const control = nativeData(
          ControlStateSchema,
          reply,
          command.kind === "stop" ? "d_pi_stop" : "d_pi_continue",
        );
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
          const instance = native;
          const latest = await tasks.run((signal) =>
            instance.request("d_pi_state", {}, { signal }),
          );
          if (closing || disconnected) return;
          if (version !== observationVersion) {
            // A later native observation invalidates this shutdown evidence too.
            send({ kind: "failed", code: "active-work" });
            void refresh();
            return;
          }
          if (latest.success !== true) throw Error("Cannot verify shutdown");
          const actual = nativeData(ControlStateSchema, latest, "d_pi_state");
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
        await tasks.close();
        disposeHost();
        exit(0);
      })
      .exhaustive()
      .catch(async (error: unknown) => {
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
            ...failureFields(error),
          });
        send({
          kind: "failed",
          code: "runtime-unavailable",
          ...failureFields(error),
        });
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

import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { match } from "ts-pattern";
import type { DiagnosticEvent } from "../../../../platform/main/diagnostics/public";
import { identifyDirectory } from "../../../../platform/node/filesystem/public";
import {
  managedSdkRuntime,
  RuntimeResourceError,
} from "../../../../platform/omp/resources/public";
import { uiMessage } from "../../../../shared/messages/contracts";
import type { ContentPreparationResult } from "../../../input/contracts/public";
import type {
  DirectoryIdentity,
  ThreadContext,
} from "../../../threads/contracts/public";
import type { ThreadRepository } from "../../../threads/main/public";
import type { HostMessage, ProcessExitEvidence } from "../../contracts/host";
import {
  type NativeFailureSummary,
  nativeFailureCode,
} from "../../contracts/native-failure";
import {
  type FrozenSubmission,
  type SubmissionCommand,
  type SubmissionReply,
} from "../../contracts/public";
import type {
  NativeRecoveryReason,
  RuntimeCommand,
  RuntimeView,
} from "../../contracts/runtime";
import { SubmissionCoordinator, sameSubmissionTarget } from "../../core/public";
import {
  RuntimeAdmission,
  sameDirectoryIdentity,
} from "../../core/runtime/admission";
import {
  canSubmit,
  queueCapped,
} from "../../core/submission/submission-admission";
import type { QueueChangeRepository } from "../queue/queue-change-repository";
import type { SubmissionRepository } from "../submission/submission-repository";
import { HostConnection } from "../transport/host-connection";
import { indexedSessionDirectory } from "../transport/indexed-session-binding";

type RuntimeStore = {
  queueChanges: Pick<
    QueueChangeRepository,
    "prepare" | "finish" | "list" | "find"
  >;
  threads: Pick<
    ThreadRepository,
    | "activeThread"
    | "threadContext"
    | "executionGrant"
    | "grantExecution"
    | "revokeExecution"
    | "bindNativeSession"
    | "nativeSessionBinding"
  >;
  submissions: Pick<
    SubmissionRepository,
    | "prepareSubmission"
    | "dispatchSubmission"
    | "recoverInterruptedSubmissions"
    | "acknowledgeSubmission"
    | "submission"
    | "list"
    | "rejectSubmission"
    | "unknownSubmission"
    | "failSubmission"
    | "observePromptResult"
  >;
};

function boundedDisplayValue(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function recoveryFailureMessage(reason: NativeRecoveryReason) {
  return match(reason)
    .with("binding-changed", () => uiMessage("runtime.recoveryBindingChanged"))
    .with("occupied", () => uiMessage("runtime.recoveryOccupied"))
    .with("owner-unknown", () => uiMessage("runtime.recoveryOwnerUnknown"))
    .with("shutdown-unconfirmed", () =>
      uiMessage("runtime.recoveryShutdownUnconfirmed"),
    )
    .with("lease-unavailable", () =>
      uiMessage("runtime.recoveryLeaseUnavailable"),
    )
    .exhaustive();
}

export class RuntimeService {
  private readonly executingIds = new Set<string>();
  private readonly pendingEvidence = new Set<string>();
  private lostEvidence = false;
  private lastDispatchId: string | null = null;
  private idleConfirmed = false;
  private target: FrozenSubmission["target"] | null = null;
  private coordinator: SubmissionCoordinator;
  private readonly connection: HostConnection;
  private view: RuntimeView | null = null;
  private readonly admission: RuntimeAdmission;
  private readonly environment: Record<string, string>;
  private launchGeneration = 0;
  private sessionStarted = false;
  private currentConnectionGeneration: string | null = null;
  private instanceDirectory: DirectoryIdentity | undefined;
  constructor(
    private readonly store: RuntimeStore,
    private readonly resources: string,
    private readonly dataDirectory: string,
    environment: NodeJS.ProcessEnv,
    private readonly publish: (view: RuntimeView) => void,
    private readonly publishSubmission: (
      reply: SubmissionReply,
    ) => void = () => {},
    private readonly record: (event: DiagnosticEvent) => void = () => {},
    private readonly scopeThreadId?: string,
    private readonly prepareContent?: (
      threadId: string,
      text: string,
    ) => Promise<ContentPreparationResult>,
    private readonly indexedSessionsRoot?: (
      traceId: string,
    ) => Promise<string | null>,
  ) {
    this.connection = new HostConnection(
      (message) => this.receive(message),
      (evidence) => this.onExit(evidence),
      (confirmed) => {
        if (!confirmed) return;
        this.sessionStarted = false;
        this.target = null;
        this.currentConnectionGeneration = null;
        this.executingIds.clear();
        this.pendingEvidence.clear();
        if (this.view) {
          this.view = { ...this.view };
          delete this.view.control;
          delete this.view.interactions;
          delete this.view.queueOperation;
          delete this.view.subagentOperation;
          delete this.view.modelChanging;
        }
        this.update({ busy: false });
      },
    );
    this.coordinator = new SubmissionCoordinator(
      store.submissions,
      {
        isCurrentTarget: (target) =>
          this.target !== null && sameSubmissionTarget(this.target, target),
        canDispatch: (target) =>
          this.target?.processInstanceId === target.processInstanceId &&
          canSubmit(this.view) &&
          this.connection.connected,
        write: (value) => {
          if (!this.connection.connected) throw Error("Host unavailable");
          this.executingIds.add(value.submissionId);
          this.lastDispatchId = value.submissionId;
          this.idleConfirmed = false;
          this.update({
            busy: true,
            message: uiMessage("runtime.processingInput"),
          });
          this.connection.send({ kind: "dispatch", value });
        },
      },
      record,
    );
    this.environment = Object.fromEntries(
      Object.entries(environment).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
    this.admission = new RuntimeAdmission(
      store.threads,
      identifyDirectory,
      (thread, identity) => this.launch(thread, identity),
    );
  }
  private async launch(
    thread: ThreadContext,
    identity: DirectoryIdentity,
  ): Promise<void> {
    const launchAttempt = this.launchGeneration;
    let binary: string;
    let sdkEntry: string;
    try {
      const resource = await managedSdkRuntime(this.resources);
      binary = resource.binary;
      sdkEntry = resource.entry;
    } catch (error) {
      this.update({
        phase: "failed",
        busy: false,
        message:
          error instanceof RuntimeResourceError
            ? uiMessage("runtime.sdkResourcesUnavailable")
            : uiMessage("runtime.resourceUnknown"),
      });
      throw error;
    }
    const previous = this.store.threads.nativeSessionBinding(thread.threadId);
    let sessionDirectory = join(
      this.dataDirectory,
      "native-sessions",
      thread.threadId,
    );
    if (thread.origin === "cli") {
      // Discovery is not an execution grant. Revalidate the configured root,
      // canonical exact file and project before entering ordinary admission.
      const configured = await this.indexedSessionsRoot?.(
        this.view?.traceId ?? randomUUID(),
      );
      sessionDirectory = await indexedSessionDirectory(
        configured,
        previous,
        thread.directory,
      );
    } else {
      await mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
    }
    const current = await identifyDirectory(thread.directory);
    const grant = this.store.threads.executionGrant(thread.workingDirectoryId);
    if (
      launchAttempt !== this.launchGeneration ||
      !grant ||
      grant.inode !== current.inode ||
      grant.device !== current.device ||
      current.directory !== identity.directory
    )
      throw Error("Execution grant changed");
    if (this.connection.connected || this.sessionStarted)
      throw Error("Native recovery requires lifetime single-writer evidence");
    const processInstanceId = randomUUID();
    const connectionGeneration = randomUUID();
    this.currentConnectionGeneration = connectionGeneration;
    this.update({ connectionGeneration: connectionGeneration });
    const context =
      previous?.configContextId ??
      createHash("sha256")
        .update(
          JSON.stringify({ cwd: thread.directory, env: this.environment }),
        )
        .digest("hex");
    const starting = this.connection.start(
      {
        kind: "start",
        threadId: thread.threadId,
        traceId: this.view?.traceId ?? randomUUID(),
        processInstanceId,
        connectionGeneration,
        configContextId: context,
        binary,
        sdkEntry,
        identity: current,
        environment: {
          ...this.environment,
          ...(this.view?.selectedModel
            ? { D_PI_MODEL_SELECTION: JSON.stringify(this.view.selectedModel) }
            : {}),
        },
        sessionDirectory,
        ...(previous
          ? {
              resume: {
                sessionFile: previous.sessionFile,
                sessionId: previous.sessionId,
                ...(previous.origin === "cli"
                  ? { origin: previous.origin }
                  : {}),
              },
            }
          : {}),
      },
      (message) => {
        try {
          if (
            previous &&
            (message.state.sessionFile !== previous.sessionFile ||
              message.state.sessionId !== previous.sessionId)
          )
            throw Error("Recovered native session identity conflict");
          this.store.threads.bindNativeSession({
            threadId: thread.threadId,
            configContextId: context,
            sessionFile: message.state.sessionFile,
            sessionId: message.state.sessionId,
          });
        } catch {
          this.connection.send({ kind: "close-idle" });
          throw Error("Native binding persistence failed");
        }
        this.target = {
          processInstanceId,
          connectionGeneration,
          configContextId: context,
          nativeSessionRef: message.state.sessionFile,
        };
        const model = message.state.model;
        this.update({
          phase: "ready",
          busy:
            message.state.isStreaming ||
            message.state.isCompacting ||
            message.state.queuedMessageCount > 0,
          model: model ? `${model.provider}/${model.id}` : null,
          ...(message.state.thinkingLevel
            ? { thinkingLevel: message.state.thinkingLevel }
            : {}),
          message: model
            ? uiMessage("runtime.readyToSend")
            : uiMessage("runtime.noModel"),
        });
      },
    );
    this.instanceDirectory = current;
    this.sessionStarted = true;
    try {
      await starting;
    } catch (error) {
      // Identity sampling/fork can fail before any start reached Host. Preserve
      // the cold write lock whenever startup was dispatched, even if ready lost.
      if (!this.connection.startAttempted) this.sessionStarted = false;
      throw error;
    }
  }
  private onExit(evidence?: ProcessExitEvidence): void {
    if (evidence) this.recordProcessExit(evidence);
    this.recordHost("exited");
    const uncertain = this.executingIds.size > 0;
    for (const submissionId of this.executingIds) {
      try {
        this.store.submissions.unknownSubmission(submissionId);
        const receipt = this.store.submissions.submission(submissionId);
        if (receipt) {
          try {
            this.record({
              traceId: receipt.traceId,
              requestId: receipt.requestId,
              connectionId: receipt.target.connectionGeneration,
              nativeProcessInstanceId: receipt.target.processInstanceId,
              submissionId: receipt.submissionId,
              threadId: receipt.threadId,
              operation: "submit",
              stage: "unknown",
              receiptState: receipt.state,
              outcome: receipt.outcome,
              code: "host-exited",
            });
          } catch {
            /* Diagnostics cannot prevent receipt publication. */
          }
          this.publishSubmission({ kind: "receipt", receipt });
        }
      } catch {
        /* Recovered as unknown on restart if still dispatching. */
      }
    }
    this.update({
      phase: "interrupted",
      busy: uncertain,
      message: uiMessage("runtime.disconnected"),
    });
  }
  private recordHost(
    stage: "disconnected" | "exited" | "failed",
    reason?: string,
    nativeFailure?: NativeFailureSummary,
  ): void {
    if (!this.view || !this.currentConnectionGeneration) return;
    // Only known adapter codes are safe to persist; raw upstream errors may
    // contain credentials or content and cannot establish root attribution.
    const code = match(reason)
      .with(
        "spawn",
        "protocol",
        "exit",
        "write",
        "state-unavailable",
        (value) => value,
      )
      .with("active-work", "runtime-unavailable", (value) => value)
      .otherwise(() => "unknown");
    try {
      this.record({
        traceId: this.view.traceId,
        requestId: this.view.traceId,
        connectionId: this.currentConnectionGeneration,
        ...(this.target
          ? { nativeProcessInstanceId: this.target.processInstanceId }
          : {}),
        threadId: this.view.threadId,
        operation: "runtime:host",
        stage,
        ...(reason === undefined ? {} : { code }),
        ...(nativeFailure
          ? { causeCode: nativeFailureCode(nativeFailure) }
          : {}),
      });
    } catch {
      /* Diagnostic failure cannot change execution or recovery. */
    }
  }
  private recordProcessExit(evidence: ProcessExitEvidence): void {
    if (!this.view || !this.currentConnectionGeneration) return;
    try {
      this.record({
        traceId: this.view.traceId,
        requestId: this.view.traceId,
        connectionId: this.currentConnectionGeneration,
        ...(this.target
          ? { nativeProcessInstanceId: this.target.processInstanceId }
          : {}),
        threadId: this.view.threadId,
        operation: `runtime:${evidence.process}-exit`,
        stage: "exited",
        processPid: evidence.pid,
        exitCode: evidence.exitCode,
        exitSignal: evidence.signal,
        terminationReason: evidence.reason,
        requestedExitCode: evidence.requestedExitCode,
      });
    } catch {
      /* Diagnostics cannot change recovery. */
    }
  }
  private settleIdleSubmissions(): void {
    const control = this.view?.control;
    const interactions = this.view?.interactions;
    if (
      this.pendingEvidence.size > 0 ||
      !this.idleConfirmed ||
      this.view?.busy ||
      control?.stopping ||
      control?.streaming ||
      control?.compacting ||
      control?.queued ||
      control?.background ||
      control?.pendingAsync ||
      control?.admitted ||
      interactions?.unsupported ||
      interactions?.items.some(
        (item) => item.status === "pending" || item.status === "unknown",
      )
    )
      return;
    // Resolve each receipt independently. Idle is necessary but never enough
    // for a request whose dispatch/result is still genuinely unknown.
    for (const id of this.executingIds) {
      const receipt = this.store.submissions.submission(id);
      if (
        receipt?.state === "rejected" ||
        receipt?.outcome === "failed" ||
        receipt?.outcome === "completed" ||
        receipt?.outcome === "aborted"
      )
        this.executingIds.delete(id);
    }
  }
  private receive(
    message: Exclude<HostMessage, { kind: "ready" | "native-register" }>,
  ): void {
    match(message)
      .with({ kind: "subagents" }, ({ connectionGeneration, state }) => {
        if (connectionGeneration === this.currentConnectionGeneration)
          this.update({ subagents: state });
      })
      .with({ kind: "process-exit" }, ({ connectionGeneration, evidence }) => {
        if (connectionGeneration === this.currentConnectionGeneration)
          this.recordProcessExit(evidence);
      })
      .with({ kind: "evidence-gap" }, ({ connectionGeneration, reason }) => {
        if (connectionGeneration !== this.currentConnectionGeneration) return;
        this.lostEvidence = true;
        this.update({
          evidenceCoverage: "gap",
          message: uiMessage("runtime.evidenceGap"),
        });
        try {
          this.record({
            traceId: this.view?.traceId ?? randomUUID(),
            requestId: this.view?.traceId ?? randomUUID(),
            connectionId: connectionGeneration,
            operation: "runtime:evidence",
            stage: "unknown",
            code: reason,
            ...(this.view ? { threadId: this.view.threadId } : {}),
          });
        } catch {
          /* A diagnostic failure cannot erase the visible evidence gap. */
        }
      })
      .with(
        { kind: "idle-confirmed" },
        ({ connectionGeneration, afterSubmissionId }) => {
          if (
            connectionGeneration !== this.currentConnectionGeneration ||
            afterSubmissionId !== this.lastDispatchId
          )
            return;
          this.idleConfirmed = true;
          this.settleIdleSubmissions();
        },
      )
      .with(
        { kind: "operation-result" },
        ({
          traceId,
          connectionGeneration,
          operation,
          status,
          code,
          nativeFailure,
        }) => {
          if (connectionGeneration !== this.currentConnectionGeneration) return;
          if (
            operation === "manage-queue" ||
            operation === "configure-subagent"
          ) {
            let observed = status;
            if (operation === "manage-queue") {
              try {
                if (this.store.queueChanges.find(traceId))
                  this.store.queueChanges.finish(traceId, status);
              } catch {
                observed = "unknown";
              }
            }
            const field =
              operation === "manage-queue"
                ? "queueOperation"
                : "subagentOperation";
            if (this.view?.[field]?.traceId === traceId)
              this.update({
                [field]: {
                  traceId,
                  status: observed,
                  ...(code ? { code } : {}),
                },
              });
          }
          if (operation === "select-model")
            this.update({
              modelChanging: false,
              ...(status === "unknown"
                ? { model: null, message: uiMessage("runtime.controlUnknown") }
                : {}),
            });
          if (status === "failed")
            this.update({
              traceId,
              message: uiMessage("runtime.controlFailed"),
            });
          this.record({
            traceId,
            requestId: traceId,
            connectionId: connectionGeneration,
            operation: `runtime:${operation}`,
            stage: status,
            ...(nativeFailure
              ? { causeCode: nativeFailureCode(nativeFailure) }
              : {}),
            ...(this.view ? { threadId: this.view.threadId } : {}),
            ...(this.target
              ? { nativeProcessInstanceId: this.target.processInstanceId }
              : {}),
          });
        },
      )
      .with({ kind: "interactions" }, ({ view }) => {
        if (view.connectionGeneration === this.currentConnectionGeneration) {
          if (
            view.unsupported ||
            view.items.some(
              (item) => item.status === "pending" || item.status === "unknown",
            )
          )
            this.idleConfirmed = false;
          this.update({ interactions: view });
        }
      })
      .with({ kind: "control" }, ({ connectionGeneration, state }) => {
        if (connectionGeneration !== this.currentConnectionGeneration) return;
        if (
          state.streaming ||
          state.compacting ||
          state.stopping ||
          state.queued ||
          state.background ||
          state.pendingAsync ||
          state.admitted
        )
          this.idleConfirmed = false;
        this.update({
          connectionGeneration,
          control: state,
          busy:
            state.streaming ||
            state.compacting ||
            state.queued > 0 ||
            state.background > 0 ||
            state.pendingAsync ||
            state.admitted,
          message: state.paused
            ? uiMessage("runtime.queuePaused")
            : uiMessage("runtime.controlUpdated"),
        });
        this.settleIdleSubmissions();
      })
      .with({ kind: "submission" }, ({ event, evidenceId }) => {
        // Host retains correlations for late replies, not execution ownership.
        // Only Main's in-flight set determines which attempts a disconnect affects.
        if (
          event.kind === "disconnected" &&
          !this.executingIds.has(event.submissionId)
        )
          return;
        const result = this.coordinator.receive(event);
        this.publishSubmission(result);
        if (result.kind === "failed" && result.code === "storage-unavailable") {
          this.pendingEvidence.add(evidenceId);
          this.executingIds.add(event.submissionId);
          this.update({
            evidenceCoverage: "gap",
            message: uiMessage("runtime.evidenceGap"),
          });
        }
        if (result.kind === "receipt") {
          if (
            this.pendingEvidence.delete(evidenceId) &&
            !this.pendingEvidence.size &&
            !this.lostEvidence
          )
            this.update({ evidenceCoverage: "complete" });
          try {
            this.connection.send({
              kind: "confirm-evidence",
              evidenceId,
              connectionGeneration: event.target.connectionGeneration,
            });
          } catch {
            /* The evidence is durable; a dead Host cannot replay it. */
          }
        }
        this.settleIdleSubmissions();
      })
      .with({ kind: "state" }, ({ state, busy, pendingInteraction }) => {
        if (busy || pendingInteraction) this.idleConfirmed = false;
        const model = state.model;
        this.update({
          busy: busy || pendingInteraction,
          ...(state.thinkingLevel
            ? { thinkingLevel: state.thinkingLevel }
            : {}),
          model: model ? `${model.provider}/${model.id}` : null,
          message: pendingInteraction
            ? uiMessage("runtime.pendingInteraction")
            : busy
              ? uiMessage("runtime.processing")
              : uiMessage("runtime.idle"),
        });
        this.settleIdleSubmissions();
      })
      .with({ kind: "failed" }, { kind: "interrupted" }, (failure) => {
        this.recordHost(
          failure.kind === "interrupted" ? "disconnected" : "failed",
          failure.kind === "interrupted" ? failure.reason : failure.code,
          failure.nativeFailure,
        );
        this.update({
          phase: "interrupted",
          busy: true,
          message: uiMessage("runtime.statusUnknown"),
        });
      })
      .exhaustive();
  }
  private update(change: Partial<RuntimeView>): void {
    if (!this.view) return;
    this.view = { ...this.view, ...change, revision: this.view.revision + 1 };
    this.publish(this.view);
  }
  async execute(command: RuntimeCommand): Promise<RuntimeView> {
    const thread = this.scopeThreadId
      ? this.store.threads.threadContext(this.scopeThreadId)
      : this.store.threads.activeThread();
    if (!thread || thread.threadId !== command.threadId)
      throw Error("Inactive Thread");
    if (!this.view) {
      const trusted = !!this.store.threads.executionGrant(
        thread.workingDirectoryId,
      );
      const profile = (
        this.environment.OMP_PROFILE ??
        this.environment.PI_PROFILE ??
        ""
      ).trim();
      this.view = {
        configuration: profile
          ? {
              code: "runtime.configProfile",
              params: { profile: boundedDisplayValue(profile, 120) },
            }
          : this.environment.PI_CODING_AGENT_DIR
            ? {
                code: "runtime.configDirectory",
                params: {
                  directory: boundedDisplayValue(
                    this.environment.PI_CODING_AGENT_DIR,
                    2048,
                  ),
                },
              }
            : uiMessage("runtime.configDefault"),
        revision: 0,
        threadId: thread.threadId,
        traceId: command.traceId,
        phase: trusted ? "allowed" : "browse",
        trusted,
        busy: false,
        model: null,
        message: uiMessage("runtime.preStartTrust"),
      };
    }
    if (
      command.kind === "manage-queue" ||
      command.kind === "configure-subagent"
    ) {
      const field =
        command.kind === "manage-queue"
          ? "queueOperation"
          : "subagentOperation";
      if (command.kind === "manage-queue") {
        const existing = this.store.queueChanges.find(command.traceId);
        if (existing) {
          if (
            existing.threadId !== command.threadId ||
            existing.target.connectionGeneration !==
              command.connectionGeneration ||
            !isDeepStrictEqual(existing.command, command.command)
          )
            throw Error("Queue change identity conflict");
          if (
            this.view.queueOperation &&
            this.view.queueOperation.traceId !== command.traceId
          )
            return this.view;
          this.update({
            queueOperation: {
              traceId: command.traceId,
              status:
                existing.status === "dispatching" ? "pending" : existing.status,
            },
          });
          return this.view;
        }
      }
      const assertOperationTarget = () => {
        const operation = this.view?.[field];
        if (operation?.status === "unknown" && operation.reconciled !== true)
          throw Error("Unknown operation requires fresh state");
        if (
          !this.connection.connected ||
          command.connectionGeneration !== this.currentConnectionGeneration ||
          this.view?.phase !== "ready" ||
          operation?.status === "pending"
        )
          throw Error("Stale operation target");
      };
      assertOperationTarget();
      const identity = await identifyDirectory(thread.directory);
      assertOperationTarget();
      const grant = this.store.threads.executionGrant(
        thread.workingDirectoryId,
      );
      if (
        !grant ||
        !this.instanceDirectory ||
        !sameDirectoryIdentity(grant, identity) ||
        !sameDirectoryIdentity(this.instanceDirectory, identity) ||
        command.connectionGeneration !== this.currentConnectionGeneration
      )
        throw Error("Execution grant invalid");
      if (command.kind === "manage-queue") {
        const snapshot = this.view.control?.queueState;
        const entry = snapshot?.items.find(
          (item) => item.id === command.command.entryId,
        );
        if (
          !snapshot ||
          !entry ||
          snapshot.revision !== command.command.revision
        )
          throw Error("Stale queue snapshot");
        if (
          command.command.action === "begin-edit" &&
          (!entry.editable || entry.truncated)
        )
          throw Error("Unsupported queue content");
        // Reserving the active draft can truncate its original display text.
        if (
          (command.command.action === "save-edit" ||
            command.command.action === "update-edit") &&
          snapshot.editing?.entryId !== command.command.entryId
        )
          throw Error("Queue entry is not being edited");
        if (["save-edit", "delete", "move"].includes(command.command.action)) {
          if (!this.target) throw Error("Native identity unavailable");
          this.store.queueChanges.prepare({
            traceId: command.traceId,
            threadId: command.threadId,
            target: this.target,
            command: command.command,
            previousText: entry.text,
            ...(entry.images ? { previousImages: entry.images } : {}),
            previousTruncated: entry.truncated,
          });
        }
      }
      this.update({
        traceId: command.traceId,
        [field]: { traceId: command.traceId, status: "pending" },
      });
      const response = await this.connection.operation(
        command.kind === "manage-queue"
          ? { kind: "manage-queue", command }
          : { kind: "configure-subagent", command },
      );
      if (command.connectionGeneration !== this.currentConnectionGeneration)
        return this.view;
      let status = response.status;
      if (command.kind === "manage-queue") {
        try {
          if (this.store.queueChanges.find(command.traceId))
            this.store.queueChanges.finish(command.traceId, status);
        } catch {
          status = "unknown";
        }
      }
      this.update({
        [field]: {
          traceId: command.traceId,
          status,
          ...(response.code ? { code: response.code } : {}),
        },
        ...(status === "unknown"
          ? { message: uiMessage("runtime.controlUnknown") }
          : {}),
      });
      return this.view;
    }
    if (command.kind === "select-model") {
      if (this.hasActiveWork() || this.view.modelChanging)
        throw Error("Model change requires idle Thread");
      if (this.connection.connected && this.currentConnectionGeneration) {
        const identity = await identifyDirectory(thread.directory);
        const grant = this.store.threads.executionGrant(
          thread.workingDirectoryId,
        );
        if (
          !grant ||
          !this.instanceDirectory ||
          !sameDirectoryIdentity(grant, identity) ||
          !sameDirectoryIdentity(this.instanceDirectory, identity)
        )
          throw Error("Execution grant invalid");
        this.connection.send({
          kind: "select-model",
          command,
          connectionGeneration: this.currentConnectionGeneration,
        });
        this.update({ modelChanging: true, traceId: command.traceId });
      } else {
        this.update({
          selectedModel: command.selection,
          traceId: command.traceId,
        });
      }
      return this.view;
    }
    if (command.kind === "answer") {
      if (
        !this.connection.connected ||
        command.connectionGeneration !== this.currentConnectionGeneration
      )
        throw Error("Stale answer target");
      if (command.answer.kind !== "cancel") {
        const identity = await identifyDirectory(thread.directory);
        const grant = this.store.threads.executionGrant(
          thread.workingDirectoryId,
        );
        if (
          !grant ||
          !this.instanceDirectory ||
          !sameDirectoryIdentity(grant, identity) ||
          !sameDirectoryIdentity(this.instanceDirectory, identity)
        )
          throw Error("Execution grant invalid");
      }
      this.connection.send({ kind: "answer", command });
      return this.view;
    }
    if (command.kind === "dismiss") {
      // Local unknown cleanup: no directory grant needed (no native write),
      // only the connectionGeneration check to avoid dismissing a new connection's view.
      if (
        !this.connection.connected ||
        command.connectionGeneration !== this.currentConnectionGeneration
      )
        throw Error("Stale dismiss target");
      this.connection.send({ kind: "dismiss", command });
      return this.view;
    }
    if (command.kind === "stop" || command.kind === "continue") {
      if (
        !this.connection.connected ||
        command.connectionGeneration !== this.currentConnectionGeneration
      )
        throw Error("Stale control target");
      if (command.kind === "continue") {
        const identity = await identifyDirectory(thread.directory);
        const grant = this.store.threads.executionGrant(
          thread.workingDirectoryId,
        );
        if (
          !grant ||
          !this.instanceDirectory ||
          !sameDirectoryIdentity(grant, identity) ||
          !sameDirectoryIdentity(this.instanceDirectory, identity)
        )
          throw Error("Execution grant invalid");
      }
      this.connection.send({ kind: "control", command });
      this.update({
        traceId: command.traceId,
        message: uiMessage("runtime.controlDispatched"),
      });
      return this.view;
    }
    await match(command.kind)
      .with("inspect", async () => {
        if (
          !this.connection.connected &&
          (this.view?.phase === "browse" || this.view?.phase === "allowed")
        ) {
          const grant = this.store.threads.executionGrant(
            thread.workingDirectoryId,
          );
          let trusted = false;
          try {
            const identity = await identifyDirectory(thread.directory);
            trusted = !!grant && sameDirectoryIdentity(grant, identity);
          } catch {
            /* A missing or replaced directory cannot inherit trust. */
          }
          this.update({
            trusted,
            phase: trusted ? "allowed" : "browse",
            message: uiMessage(
              grant && !trusted
                ? "runtime.grantInvalid"
                : "runtime.preStartTrust",
            ),
          });
        }
        if (this.connection.connected && this.currentConnectionGeneration) {
          if (
            this.view?.queueOperation?.status !== "unknown" &&
            this.view?.subagentOperation?.status !== "unknown"
          ) {
            this.connection.send({ kind: "state" });
            return;
          }
          const generation = this.currentConnectionGeneration;
          const result = await this.connection.operation({
            kind: "state",
            traceId: command.traceId,
            connectionGeneration: generation,
          });
          if (
            result.status === "acknowledged" &&
            this.currentConnectionGeneration === generation
          ) {
            this.update({
              ...(this.view?.queueOperation?.status === "unknown"
                ? {
                    queueOperation: {
                      ...this.view.queueOperation,
                      reconciled: true,
                    },
                  }
                : {}),
              ...(this.view?.subagentOperation?.status === "unknown"
                ? {
                    subagentOperation: {
                      ...this.view.subagentOperation,
                      reconciled: true,
                    },
                  }
                : {}),
            });
          }
        }
      })
      .with("allow", async () => {
        const result = await this.admission.allow(
          command.threadId,
          this.instanceDirectory,
        );
        this.update(
          result.kind === "allowed"
            ? {
                trusted: true,
                phase: this.connection.connected
                  ? (this.view?.phase ?? "interrupted")
                  : "allowed",
                traceId: command.traceId,
              }
            : {
                phase: this.connection.connected
                  ? (this.view?.phase ?? "interrupted")
                  : "failed",
                trusted: false,
                message:
                  result.kind === "denied" &&
                  result.reason === "directory-changed"
                    ? uiMessage("runtime.directoryChanged")
                    : uiMessage("runtime.grantSaveFailed"),
              },
        );
      })
      .with("revoke", async () => {
        this.launchGeneration++;
        this.admission.revoke(command.threadId);
        if (this.connection.connected && this.currentConnectionGeneration)
          this.connection.send({
            kind: "control",
            command: {
              kind: "stop",
              threadId: command.threadId,
              traceId: command.traceId,
              connectionGeneration: this.currentConnectionGeneration,
            },
          });
        this.update({
          trusted: false,
          phase: this.connection.connected
            ? (this.view?.phase ?? "interrupted")
            : "browse",
          message: this.connection.connected
            ? uiMessage("runtime.revokedStopRequested")
            : uiMessage("runtime.browseOnly"),
        });
      })
      .with("start", async () => {
        if (
          this.connection.connected ||
          this.sessionStarted ||
          this.view?.phase === "starting"
        )
          return;
        if (this.view) {
          this.view = { ...this.view };
          delete this.view.recoveryFailure;
        }
        this.update({
          phase: "starting",
          traceId: command.traceId,
          busy: true,
          message: uiMessage("runtime.starting"),
        });
        const result = await this.admission.start(command.threadId);
        if (result.kind !== "started")
          this.update({
            phase: "failed",
            busy: this.connection.connected,
            ...(result.kind === "denied" && result.reason === "recovery"
              ? {
                  recoveryFailure: result.failure,
                  message: recoveryFailureMessage(result.failure),
                }
              : {
                  message:
                    this.view?.phase === "failed"
                      ? this.view.message
                      : uiMessage("runtime.notReady"),
                }),
          });
      })
      .exhaustive();
    return this.view;
  }
  async submit(command: SubmissionCommand): Promise<SubmissionReply> {
    const thread = this.scopeThreadId
      ? this.store.threads.threadContext(this.scopeThreadId)
      : this.store.threads.activeThread();
    if (!thread || thread.threadId !== command.threadId)
      throw Error("Inactive Thread");
    if (command.kind === "list")
      return {
        kind: "list",
        receipts: this.store.submissions.list(command.threadId),
      };
    // Repeated requests return their persisted identity; they never make a new native call.
    const existing = this.store.submissions.submission(command.submissionId);
    if (existing && existing.threadId !== command.threadId)
      throw Error("Foreign submission");
    // Queue cap (2026-09-28 user decision): only commands that add a new
    // queue entry are gated. Dispatching an already counted prepared entry
    // keeps the count unchanged and must stay possible at the cap. The count
    // shares submission-admission.queueCapped with the Renderer hint so the
    // two cannot diverge.
    if (
      (command.kind === "prepare" || command.kind === "resend") &&
      !existing
    ) {
      const queueState = this.view?.control?.queueState;
      if (
        queueCapped(
          this.store.submissions.list(command.threadId),
          queueState
            ? queueState.items.length + queueState.hiddenCount
            : (this.view?.control?.queue.length ?? 0),
        )
      )
        return {
          kind: "failed",
          code: "queue-full",
          error: {
            errorId: randomUUID(),
            traceId: command.traceId,
            code: "queue-full",
            observedAt: "main",
            reportedBy: "app",
            attribution: "unknown",
            handlingOwner: "submission",
            recovery: "user_action",
            message: uiMessage("submission.queueFull"),
          },
        };
    }
    if (this.view?.modelChanging) throw Error("Model change pending");
    if (command.kind === "prepare" && existing) {
      if (
        existing.text !== command.text ||
        existing.revision !== command.revision ||
        existing.delivery !== command.delivery
      )
        throw Error("Submission identity conflict");
      return { kind: "receipt", receipt: existing };
    }
    // Historical read before directory/grant recheck (A12 lock): non-prepared
    // dispatch returns the persisted receipt without a native write (see
    // coordinator.dispatch fast return). Execution permission gates new side
    // effects, never the lookup of what already happened, so revoking the
    // grant must not turn a status check into an error.
    if (command.kind === "dispatch" && existing?.state !== "prepared")
      return this.coordinator.dispatch(command.submissionId);
    try {
      const identity = await identifyDirectory(thread.directory);
      const grant = this.store.threads.executionGrant(
        thread.workingDirectoryId,
      );
      if (
        !grant ||
        grant.directory !== identity.directory ||
        grant.device !== identity.device ||
        grant.inode !== identity.inode ||
        !this.instanceDirectory ||
        !sameDirectoryIdentity(this.instanceDirectory, identity)
      )
        throw Error("Execution grant invalid");
    } catch (error) {
      this.update({
        trusted: false,
        message: uiMessage("runtime.grantInvalid"),
      });
      // This validation precedes every transport write. Re-read in the coordinator
      // so a concurrent dispatch cannot be relabelled as never dispatched.
      if (existing?.state === "prepared" && command.kind !== "prepare")
        return this.coordinator.dispatch(existing.submissionId);
      throw error;
    }
    if (command.kind === "resend") {
      if (existing) return this.coordinator.dispatch(existing.submissionId);
      const source = this.store.submissions.submission(command.originalId);
      if (!source || source.threadId !== command.threadId || !this.target)
        throw Error("Resend source unavailable");
      const prepared = this.coordinator.prepare({
        submissionId: command.submissionId,
        threadId: command.threadId,
        traceId: command.traceId,
        revision: source.revision,
        text: source.text,
        ...(source.content ? { content: source.content } : {}),
        retryOf: source.submissionId,
        ...(source.delivery ? { delivery: source.delivery } : {}),
        ...(source.origin ? { origin: source.origin } : {}),
        target: this.target,
        requestId: randomUUID(),
      });
      return prepared.kind === "receipt"
        ? this.coordinator.dispatch(command.submissionId)
        : prepared;
    }
    if (command.kind === "dispatch")
      return this.coordinator.dispatch(command.submissionId);
    if (!this.target) throw Error("Native target unavailable");
    const { kind: _kind, ...value } = command;
    const target = this.target;
    const prepared = this.prepareContent
      ? await this.prepareContent(command.threadId, command.text)
      : null;
    const code =
      prepared && !prepared.ok
        ? "content-not-ready"
        : prepared?.ok &&
            prepared.content.images.length &&
            !this.view?.control?.imageSupport
          ? "image-unsupported"
          : null;
    if (code)
      return {
        kind: "failed",
        code,
        error: {
          errorId: randomUUID(),
          traceId: command.traceId,
          code,
          observedAt: "main",
          reportedBy: "app",
          attribution: "unknown",
          handlingOwner: "submission",
          ...(prepared && !prepared.ok
            ? {
                preparation: {
                  reason: prepared.reason,
                  ...(prepared.attachmentId
                    ? { attachmentId: prepared.attachmentId }
                    : {}),
                },
              }
            : {}),
          recovery: "user_action",
          message: uiMessage(
            prepared && !prepared.ok
              ? `attachment.reason.${prepared.reason}`
              : "submission.imageUnsupported",
          ),
        },
      };
    // Preparation may outlive a grant, model, connection or Thread reassociation.
    const identityAfterPreparation = await identifyDirectory(thread.directory);
    const grantAfterPreparation = this.store.threads.executionGrant(
      thread.workingDirectoryId,
    );
    if (
      !grantAfterPreparation ||
      !this.instanceDirectory ||
      !sameDirectoryIdentity(grantAfterPreparation, identityAfterPreparation) ||
      !sameDirectoryIdentity(this.instanceDirectory, identityAfterPreparation)
    )
      throw Error("Execution grant invalid after preparation");
    const currentThread = this.store.threads.threadContext(command.threadId);
    if (
      !this.target ||
      !sameSubmissionTarget(target, this.target) ||
      this.view?.modelChanging ||
      currentThread.directory !== thread.directory ||
      currentThread.workingDirectoryId !== thread.workingDirectoryId
    )
      throw Error("Content preparation target changed");
    return this.coordinator.prepare({
      ...value,
      ...(prepared?.ok && prepared.content.sources.length
        ? { content: prepared.content }
        : {}),
      target,
      requestId: randomUUID(),
    });
  }
  attach(port: Electron.MessagePortMain): void {
    this.connection.attach(port);
  }
  async requestStop(): Promise<void> {
    if (!this.view || !this.currentConnectionGeneration)
      throw Error("No current native target");
    await this.execute({
      kind: "stop",
      threadId: this.view.threadId,
      traceId: randomUUID(),
      connectionGeneration: this.currentConnectionGeneration,
    });
  }
  hasActiveWork(): boolean {
    const control = this.view?.control;
    const pending = this.view?.interactions;
    return (
      this.pendingEvidence.size > 0 ||
      this.executingIds.size > 0 ||
      this.view?.queueOperation?.status === "pending" ||
      this.view?.subagentOperation?.status === "pending" ||
      !!(
        control &&
        (control.stopping ||
          control.streaming ||
          control.compacting ||
          control.queued ||
          control.background ||
          control.pendingAsync ||
          control.admitted)
      ) ||
      !!(
        pending &&
        (pending.unsupported ||
          pending.items.some(
            (item) => item.status === "pending" || item.status === "unknown",
          ))
      ) ||
      this.view?.phase === "starting" ||
      (this.view?.phase === "interrupted" && this.view.busy) ||
      (this.connection.connected &&
        (!!this.view?.busy || this.view?.phase !== "ready"))
    );
  }
  async closeIdle(): Promise<void> {
    if (this.hasActiveWork()) throw Error("Active native work");
    await this.connection.closeIdle();
  }
}

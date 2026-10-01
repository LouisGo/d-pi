import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { match } from "ts-pattern";
import type { DiagnosticEvent } from "../../../platform/main/diagnostics/public";
import { identifyDirectory } from "../../../platform/node/filesystem/public";
import {
  managedSdkRuntime,
  RuntimeResourceError,
} from "../../../platform/omp/resources/public";
import { uiMessage } from "../../../shared/messages/contracts";
import type {
  DirectoryIdentity,
  ThreadContext,
} from "../../threads/contracts/public";
import type { ThreadRepository } from "../../threads/main/public";
import type { HostMessage } from "../contracts/host";
import {
  type FrozenSubmission,
  type SubmissionCommand,
  type SubmissionReply,
} from "../contracts/public";
import type { RuntimeCommand, RuntimeView } from "../contracts/runtime";
import { RuntimeAdmission, sameDirectoryIdentity } from "../core/admission";
import { SubmissionCoordinator, sameSubmissionTarget } from "../core/public";
import { canSubmit, queueCapped } from "../core/submission-admission";
import { HostConnection } from "./host-connection";
import type { SubmissionRepository } from "./submission-repository";

type RuntimeStore = {
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
  ) {
    this.connection = new HostConnection(
      (message) => this.receive(message),
      () => this.onExit(),
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
    const sessionDirectory = join(
      this.dataDirectory,
      "native-sessions",
      thread.threadId,
    );
    await mkdir(sessionDirectory, { recursive: true, mode: 0o700 });
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
    const context = createHash("sha256")
      .update(JSON.stringify({ cwd: thread.directory, env: this.environment }))
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
      },
      (message) => {
        try {
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
  private onExit(): void {
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
      });
    } catch {
      /* Diagnostic failure cannot change execution or recovery. */
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
        receipt?.outcome === "aborted" ||
        (receipt?.state === "acknowledged" && receipt.outcome !== "unknown")
      )
        this.executingIds.delete(id);
    }
  }
  private receive(
    message: Exclude<HostMessage, { kind: "ready" | "native-register" }>,
  ): void {
    match(message)
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
        ({ traceId, connectionGeneration, operation, status }) => {
          if (connectionGeneration !== this.currentConnectionGeneration) return;
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
      const previous = this.store.threads.nativeSessionBinding(thread.threadId);
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
        phase: previous ? "interrupted" : trusted ? "allowed" : "browse",
        trusted,
        busy: false,
        model: null,
        message: previous
          ? uiMessage("runtime.previousSessionReadOnly")
          : uiMessage("runtime.preStartTrust"),
      };
    }
    if (command.kind === "select-model") {
      if (
        this.store.threads.nativeSessionBinding(command.threadId) &&
        !this.connection.connected
      )
        throw Error("Read-only recovered Thread");
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
      .with("inspect", async () => {})
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
                  : this.store.threads.nativeSessionBinding(command.threadId)
                    ? "interrupted"
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
          this.store.threads.nativeSessionBinding(command.threadId) ||
          this.view?.phase === "starting"
        )
          return;
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
            message:
              this.view?.phase === "failed"
                ? this.view.message
                : uiMessage("runtime.notReady"),
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
      if (
        queueCapped(
          this.store.submissions.list(command.threadId),
          this.view?.control?.queue.length ?? 0,
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
    return this.coordinator.prepare({
      ...value,
      target: this.target,
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
    if (!this.connection.connected) return;
    if (this.hasActiveWork()) throw Error("Active native work");
    await this.connection.closeIdle();
  }
}

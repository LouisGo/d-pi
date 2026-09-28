import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { match } from "ts-pattern";
import {
  RuntimeAdmission,
  sameDirectoryIdentity,
} from "../features/runtime/admission";
import type {
  RuntimeCommand,
  RuntimeView,
} from "../features/runtime/contracts";
import type { HostMessage } from "../features/runtime/host-contracts";
import {
  canSubmit,
  queueCapped,
} from "../features/runtime/submission-admission";
import {
  type FrozenSubmission,
  type SubmissionCommand,
  type SubmissionReply,
} from "../features/submission/contracts";
import { SubmissionCoordinator } from "../features/submission/coordinator";
import type {
  DirectoryIdentity,
  ThreadContext,
} from "../features/threads/contracts";
import { identifyDirectory } from "../shared/node/directory";
import type { DiagnosticEvent } from "./diagnostics";
import { HostConnection } from "./host-connection";
import { RuntimeResourceError } from "./runtime-resource";
import { managedSdkRuntime } from "./sdk-resource";
import type { AppStorage } from "./storage/app-storage";

export class RuntimeService {
  private readonly executingIds = new Set<string>();
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
  private currentGeneration: string | null = null;
  private instanceDirectory: DirectoryIdentity | undefined;
  constructor(
    private readonly store: Pick<AppStorage, "threads" | "submissions">,
    private readonly resources: string,
    private readonly dataDirectory: string,
    environment: NodeJS.ProcessEnv,
    private readonly publish: (view: RuntimeView) => void,
    private readonly publishSubmission: (
      reply: SubmissionReply,
    ) => void = () => {},
    private readonly record: (event: DiagnosticEvent) => void = () => {},
  ) {
    this.connection = new HostConnection(
      (message) => this.receive(message),
      () => this.onExit(),
    );
    this.coordinator = new SubmissionCoordinator(
      store.submissions,
      {
        isCurrentTarget: (target) =>
          this.target !== null &&
          Object.entries(this.target).every(
            ([key, value]) => Reflect.get(target, key) === value,
          ),
        canDispatch: (target) =>
          this.target?.processInstanceId === target.processInstanceId &&
          canSubmit(this.view) &&
          this.connection.connected,
        write: (value) => {
          if (!this.connection.connected) throw Error("Host unavailable");
          this.executingIds.add(value.submissionId);
          this.lastDispatchId = value.submissionId;
          this.idleConfirmed = false;
          this.update({ busy: true, message: "正在处理输入…" });
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
    const generation = this.launchGeneration;
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
            ? error.message
            : "Runtime 资源无法确认。",
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
    const grant = this.store.threads.executionGrant(thread.workspaceId);
    if (
      generation !== this.launchGeneration ||
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
    this.currentGeneration = connectionGeneration;
    this.update({ generation: connectionGeneration });
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
        environment: this.environment,
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
          message: model
            ? "OMP 已就绪，可发送文字。"
            : "没有可用模型，请先补齐原生 OMP 配置。",
        });
      },
    );
    this.instanceDirectory = current;
    this.sessionStarted = true;
    await starting;
  }
  private onExit(): void {
    const uncertain = this.executingIds.size > 0;
    for (const submissionId of this.executingIds) {
      try {
        this.store.submissions.unknownSubmission(submissionId);
        const receipt = this.store.submissions.submission(submissionId);
        if (receipt) this.publishSubmission({ kind: "receipt", receipt });
      } catch {
        /* Recovered as unknown on restart if still dispatching. */
      }
    }
    this.update({
      phase: "interrupted",
      busy: uncertain,
      message:
        "原生连接已中断。草稿与原文保留，不自动重发。无法确认原生会话的执行全周期独占，当前只读历史，禁止强占恢复。",
    });
  }
  private settleIdleSubmissions(): void {
    const control = this.view?.control;
    const interactions = this.view?.interactions;
    if (
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
        (receipt?.state === "acknowledged" && receipt.outcome !== "unknown")
      )
        this.executingIds.delete(id);
    }
  }
  private receive(message: Exclude<HostMessage, { kind: "ready" }>): void {
    match(message)
      .with({ kind: "idle-confirmed" }, ({ generation, afterSubmissionId }) => {
        if (
          generation !== this.currentGeneration ||
          afterSubmissionId !== this.lastDispatchId
        )
          return;
        this.idleConfirmed = true;
        this.settleIdleSubmissions();
      })
      .with(
        { kind: "operation-result" },
        ({ traceId, generation, operation, status }) => {
          if (generation !== this.currentGeneration) return;
          if (status === "failed")
            this.update({
              traceId,
              message: "控制请求未完成，请核对当前原生状态；不会自动重试。",
            });
          this.record({
            traceId,
            requestId: traceId,
            connectionId: generation,
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
        if (view.generation === this.currentGeneration) {
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
      .with({ kind: "control" }, ({ generation, state }) => {
        if (generation !== this.currentGeneration) return;
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
          generation,
          control: state,
          busy:
            state.streaming ||
            state.compacting ||
            state.queued > 0 ||
            state.background > 0 ||
            state.pendingAsync ||
            state.admitted,
          message: state.paused
            ? "已暂缓队列；明确继续后恢复消费。后台活动仍按实际状态显示。"
            : "原生队列与控制状态已更新。",
        });
        this.settleIdleSubmissions();
      })
      .with({ kind: "submission" }, ({ event }) => {
        // Host retains correlations for late replies, not execution ownership.
        // Only Main's in-flight set determines which attempts a disconnect affects.
        if (
          event.kind === "disconnected" &&
          !this.executingIds.has(event.submissionId)
        )
          return;
        this.publishSubmission(this.coordinator.receive(event));
        this.settleIdleSubmissions();
      })
      .with({ kind: "state" }, ({ state, busy, pendingInteraction }) => {
        if (busy || pendingInteraction) this.idleConfirmed = false;
        const model = state.model;
        this.update({
          busy: busy || pendingInteraction,
          model: model ? `${model.provider}/${model.id}` : null,
          message: pendingInteraction
            ? "OMP 正在等待交互，请查看原生交互面板。"
            : busy
              ? "OMP 正在处理…"
              : "OMP 已空闲，可继续发送。",
        });
        this.settleIdleSubmissions();
      })
      .with({ kind: "failed" }, { kind: "interrupted" }, () => {
        this.update({
          phase: "interrupted",
          busy: true,
          message:
            "OMP 状态无法确认。请检查原生配置，应用不会自动重发或强行结束任务。",
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
    const thread = this.store.threads.activeThread();
    if (!thread || thread.threadId !== command.threadId)
      throw Error("Inactive Thread");
    if (!this.view) {
      const trusted = !!this.store.threads.executionGrant(thread.workspaceId);
      const previous = this.store.threads.nativeSession(thread.threadId);
      this.view = {
        configuration: (
          this.environment.OMP_PROFILE ?? this.environment.PI_PROFILE
        )?.trim()
          ? `OMP profile：${(this.environment.OMP_PROFILE ?? this.environment.PI_PROFILE)?.trim()}（沿用原生发现规则）`
          : this.environment.PI_CODING_AGENT_DIR
            ? `原生配置目录：${this.environment.PI_CODING_AGENT_DIR}`
            : "沿用 OMP 默认配置发现规则与应用启动环境",
        revision: 0,
        threadId: thread.threadId,
        traceId: command.traceId,
        phase: previous ? "interrupted" : trusted ? "allowed" : "browse",
        trusted,
        busy: false,
        model: null,
        message: previous
          ? "此 Thread 已有关联的原生会话。无法确认原生会话的执行全周期独占，当前只读历史；不会强占或新建会话替代。关闭外部 CLI 也不等于已经获得独占证明。"
          : "启动前会再次核对目录。项目执行不等于文件沙箱，OMP 可使用当前系统用户的权限。",
      };
    }
    if (command.kind === "answer") {
      if (
        !this.connection.connected ||
        command.generation !== this.currentGeneration
      )
        throw Error("Stale answer target");
      if (command.answer.kind !== "cancel") {
        const identity = await identifyDirectory(thread.directory);
        const grant = this.store.threads.executionGrant(thread.workspaceId);
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
    if (command.kind === "stop" || command.kind === "continue") {
      if (
        !this.connection.connected ||
        command.generation !== this.currentGeneration
      )
        throw Error("Stale control target");
      if (command.kind === "continue") {
        const identity = await identifyDirectory(thread.directory);
        const grant = this.store.threads.executionGrant(thread.workspaceId);
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
        message: "控制请求已派发，等待原生状态；不会自动重试。",
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
                  : this.store.threads.nativeSession(command.threadId)
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
                    ? "目录身份已变化，当前原生实例不能复用。已阻止新提交，现有工作不会因此停止。"
                    : "未能保存执行授权，请检查目录和本地存储。",
              },
        );
      })
      .with("revoke", async () => {
        this.launchGeneration++;
        this.admission.revoke(command.threadId);
        if (this.connection.connected && this.currentGeneration)
          this.connection.send({
            kind: "control",
            command: {
              kind: "stop",
              threadId: command.threadId,
              traceId: command.traceId,
              generation: this.currentGeneration,
            },
          });
        this.update({
          trusted: false,
          phase: this.connection.connected
            ? (this.view?.phase ?? "interrupted")
            : "browse",
          message: this.connection.connected
            ? "已阻止新操作并请求停止。现有实例仍保留，待原生状态确认；不能据此视为已停止。"
            : "当前项目仅浏览。",
        });
      })
      .with("start", async () => {
        if (
          this.connection.connected ||
          this.sessionStarted ||
          this.store.threads.nativeSession(command.threadId) ||
          this.view?.phase === "starting"
        )
          return;
        this.update({
          phase: "starting",
          traceId: command.traceId,
          busy: true,
          message: "正在校验官方 Runtime 并启动原生会话…",
        });
        const result = await this.admission.start(command.threadId);
        if (result.kind !== "started")
          this.update({
            phase: "failed",
            busy: this.connection.connected,
            message:
              this.view?.phase === "failed"
                ? this.view.message
                : "OMP 未能就绪。请检查目录授权与原生配置；当前证据无法确定配置缺失、不可读或格式不兼容。",
          });
      })
      .exhaustive();
    return this.view;
  }
  async submit(command: SubmissionCommand): Promise<SubmissionReply> {
    const thread = this.store.threads.activeThread();
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
            safeMessage:
              "排队已满（20 条），请等待消费后再发送；原文已保留，不会自动重发。",
          },
        };
    }
    if (command.kind === "prepare" && existing) {
      if (
        existing.text !== command.text ||
        existing.revision !== command.revision ||
        existing.delivery !== command.delivery
      )
        throw Error("Submission identity conflict");
      return { kind: "receipt", receipt: existing };
    }
    if (command.kind === "dispatch" && existing?.state !== "prepared")
      return this.coordinator.dispatch(command.submissionId);
    try {
      const identity = await identifyDirectory(thread.directory);
      const grant = this.store.threads.executionGrant(thread.workspaceId);
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
        message: "目录身份或执行授权无法确认，已阻止发送。",
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
    if (!this.view || !this.currentGeneration)
      throw Error("No current native target");
    await this.execute({
      kind: "stop",
      threadId: this.view.threadId,
      traceId: randomUUID(),
      generation: this.currentGeneration,
    });
  }
  hasActiveWork(): boolean {
    const control = this.view?.control;
    const pending = this.view?.interactions;
    return (
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

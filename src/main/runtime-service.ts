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
  type FrozenSubmission,
  type SubmissionCommand,
  type SubmissionReply,
} from "../features/submission/contracts";
import {
  SubmissionCoordinator,
  type SubmissionDiagnostic,
} from "../features/submission/coordinator";
import type {
  DirectoryIdentity,
  ThreadContext,
} from "../features/threads/contracts";
import { identifyDirectory } from "../shared/node/directory";
import { HostConnection } from "./host-connection";
import { managedRuntime, RuntimeResourceError } from "./runtime-resource";
import type { AppStorage } from "./storage/app-storage";

export class RuntimeService {
  private executingId: string | null = null;
  private target: FrozenSubmission["target"] | null = null;
  private coordinator: SubmissionCoordinator;
  private readonly connection: HostConnection;
  private view: RuntimeView | null = null;
  private readonly admission: RuntimeAdmission;
  private readonly environment: Record<string, string>;
  private launchGeneration = 0;
  private sessionStarted = false;
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
    record: (event: SubmissionDiagnostic) => void = () => {},
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
          this.view?.phase === "ready" &&
          this.view.trusted &&
          !this.view.busy &&
          !!this.view.model &&
          this.connection.connected,
        write: (value) => {
          if (!this.connection.connected) throw Error("Host unavailable");
          this.executingId = value.submissionId;
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
    try {
      binary = await managedRuntime(this.resources);
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
      throw Error("Native recovery requires S3");
    const processInstanceId = randomUUID();
    const connectionGeneration = randomUUID();
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
    const uncertain = !!this.executingId;
    if (this.executingId) {
      try {
        this.store.submissions.unknownSubmission(this.executingId);
        const receipt = this.store.submissions.submission(this.executingId);
        if (receipt) this.publishSubmission({ kind: "receipt", receipt });
      } catch {
        /* Recovered as unknown on restart if still dispatching. */
      }
    }
    this.update({
      phase: "interrupted",
      busy: uncertain,
      message:
        "原生连接已中断。草稿保留，不自动重发；执行恢复将在后续阶段提供。",
    });
  }
  private receive(message: Exclude<HostMessage, { kind: "ready" }>): void {
    match(message)
      .with({ kind: "submission" }, ({ event }) => {
        this.publishSubmission(this.coordinator.receive(event));
      })
      .with({ kind: "state" }, ({ state, busy, pendingInteraction }) => {
        if (!busy && !pendingInteraction) this.executingId = null;
        const model = state.model;
        this.update({
          busy: busy || pendingInteraction,
          model: model ? `${model.provider}/${model.id}` : null,
          message: pendingInteraction
            ? "OMP 正在等待交互；回答控件尚未接入。"
            : busy
              ? "OMP 正在处理…"
              : "OMP 已空闲，可继续发送。",
        });
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
          ? "此 Thread 已有关联的原生会话。当前阶段仅保留记录，不自动启动新会话替代；恢复执行将在后续阶段提供。"
          : "启动前会再次核对目录。项目执行不等于文件沙箱，OMP 可使用当前系统用户的权限。",
      };
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
        this.update({
          trusted: false,
          phase: this.connection.connected
            ? (this.view?.phase ?? "interrupted")
            : "browse",
          message: this.connection.connected
            ? "已阻止新操作。现有原生实例仍保留，不能据此视为已停止。"
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
    if (command.kind === "prepare" && existing) {
      if (
        existing.text !== command.text ||
        existing.revision !== command.revision
      )
        throw Error("Submission identity conflict");
      return { kind: "receipt", receipt: existing };
    }
    if (command.kind === "dispatch" && existing?.state !== "prepared")
      return this.coordinator.dispatch(command.submissionId);
    const identity = await identifyDirectory(thread.directory);
    const grant = this.store.threads.executionGrant(thread.workspaceId);
    if (
      !grant ||
      grant.directory !== identity.directory ||
      grant.device !== identity.device ||
      grant.inode !== identity.inode ||
      !this.instanceDirectory ||
      !sameDirectoryIdentity(this.instanceDirectory, identity)
    ) {
      this.update({
        trusted: false,
        message: "目录身份或执行授权已变化，已阻止发送。",
      });
      throw Error("Execution grant invalid");
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
  hasActiveWork(): boolean {
    return (
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

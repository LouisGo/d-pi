import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { DiagnosticEvent } from "../../../platform/main/diagnostics/public";
import { managedConfigurationRuntime } from "../../../platform/omp/resources/public";
import type { ThreadReader } from "../../threads/contracts/public";
import {
  type ConfigurationCommand,
  type ConfigurationEvent,
  ConfigurationEventSchema,
  type ConfigurationReply,
  ConfigurationReplySchema,
  type ConfigurationScope,
  ConfigurationSnapshotSchema,
  type ConfigurationSource,
  ConfigurationTransportFrameSchema,
  sameConfigurationScope,
} from "../contracts/public";

type Job = {
  id: string;
  child: ChildProcessWithoutNullStreams;
  url: string | null;
  cancelled: boolean;
  timedOut: boolean;
  scope: ConfigurationScope;
  traceId: string;
  source: ConfigurationSource | null;
  directory: string;
};
export class NativeConfiguration {
  // Navigation and project-history reads share this owner. Loading another SDK
  // for every concurrent read can starve the two long-lived execution processes.
  private snapshotBusy = false;
  private readonly snapshotWaiters = new Set<
    (failure?: "operation-timed-out" | "configuration-unavailable") => void
  >();
  private job: Job | null = null;
  private mutation = false;
  private disposed = false;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly children = new Set<ChildProcessWithoutNullStreams>();
  private event: ConfigurationEvent | null = null;
  private challenge: Extract<ConfigurationEvent, { kind: "challenge" }> | null =
    null;
  private announce(event: ConfigurationEvent): void {
    this.event = event;
    if (event.kind === "challenge") this.challenge = event;
    if (event.kind === "finished") this.challenge = null;
    this.publish(event);
  }
  currentEvents(): ConfigurationEvent[] {
    const event = this.event;
    if (!event) return [];
    return this.challenge &&
      this.challenge.jobId === event.jobId &&
      event.kind !== "challenge"
      ? [this.challenge, event]
      : [event];
  }
  constructor(
    private readonly resources: string,
    private readonly threads: Pick<ThreadReader, "threadContext">,
    private readonly applicationDirectory: string,
    environment: NodeJS.ProcessEnv,
    private readonly publish: (event: ConfigurationEvent) => void,
    private readonly open: (url: string) => Promise<void>,
    private readonly record: (event: DiagnosticEvent) => void = () => {},
  ) {
    this.environment = { ...environment };
  }
  async execute(command: ConfigurationCommand): Promise<ConfigurationReply> {
    if (command.kind !== "snapshot") return this.executeNative(command);
    const started = performance.now();
    const failure = await this.acquireSnapshot();
    if (failure) {
      try {
        this.record({
          traceId: command.traceId,
          requestId: command.traceId,
          connectionId: command.traceId,
          operation: "configuration:snapshot:queue",
          stage: "failed",
          code: failure,
          durationMs: performance.now() - started,
          ...(command.scope.kind === "thread"
            ? { threadId: command.scope.threadId }
            : {}),
        });
      } catch {
        /* Diagnostics cannot prevent a typed read failure. */
      }
      return {
        kind: "failed",
        scope: command.scope,
        traceId: command.traceId,
        source: null,
        code: failure,
      };
    }
    try {
      return await this.executeNative(command);
    } finally {
      const next = this.snapshotWaiters.values().next().value;
      if (next) next();
      else this.snapshotBusy = false;
    }
  }
  private acquireSnapshot(): Promise<
    | "operation-timed-out"
    | "configuration-unavailable"
    | "operation-in-progress"
    | undefined
  > {
    if (this.disposed) return Promise.resolve("configuration-unavailable");
    if (!this.snapshotBusy) {
      this.snapshotBusy = true;
      return Promise.resolve(undefined);
    }
    if (this.snapshotWaiters.size >= 8)
      return Promise.resolve("operation-in-progress");
    return new Promise((resolve) => {
      const done = (
        failure?: "operation-timed-out" | "configuration-unavailable",
      ) => {
        clearTimeout(timer);
        this.snapshotWaiters.delete(done);
        resolve(failure);
      };
      const timer = setTimeout(() => done("operation-timed-out"), 20000);
      this.snapshotWaiters.add(done);
    });
  }
  private async executeNative(
    command: ConfigurationCommand,
  ): Promise<ConfigurationReply> {
    const scope: ConfigurationScope =
      "scope" in command
        ? command.scope
        : (this.job?.scope ?? { kind: "application" });
    let source: ConfigurationSource | null =
      "scope" in command ? null : (this.job?.source ?? null);
    const replyIdentity = () => ({ scope, traceId: command.traceId, source });
    const failure = (
      code: Extract<ConfigurationReply, { kind: "failed" }>["code"],
    ): ConfigurationReply => ({
      kind: "failed",
      ...replyIdentity(),
      code,
    });
    try {
      if (this.disposed) return failure("configuration-unavailable");
      if (
        command.kind === "cancel" ||
        command.kind === "answer" ||
        command.kind === "open-login"
      ) {
        const job = this.job;
        if (!job || job.id !== command.jobId) return failure("invalid-job");
        if (command.kind === "cancel") {
          job.cancelled = true;
          job.child.stdin.write(JSON.stringify({ kind: "cancel" }) + "\n");
          job.child.kill();
        } else if (command.kind === "answer")
          job.child.stdin.write(
            JSON.stringify({ kind: "answer", value: command.value }) + "\n",
          );
        else {
          if (!job.url) return failure("unsafe-login-url");
          const url = new URL(job.url);
          if (
            url.username ||
            url.password ||
            !(
              url.protocol === "https:" ||
              (url.protocol === "http:" &&
                ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
            )
          )
            return failure("unsafe-login-url");
          await this.open(url.href);
        }
        return { kind: "done", ...replyIdentity() };
      }
      if (this.mutation && command.kind !== "snapshot")
        return failure("operation-in-progress");
      if (command.kind !== "snapshot") this.mutation = true;
      const resolveDirectory = () => {
        if (scope.kind === "application") return this.applicationDirectory;
        const thread = this.threads.threadContext(scope.threadId);
        if (thread.workingDirectoryId !== scope.workingDirectoryId)
          throw Error("stale-target");
        return thread.directory;
      };
      let directory: string;
      try {
        directory = resolveDirectory();
      } catch {
        if (command.kind !== "snapshot") this.mutation = false;
        return failure("stale-target");
      }
      const runtime = await managedConfigurationRuntime(this.resources);
      try {
        if (resolveDirectory() !== directory) throw Error("stale-target");
      } catch {
        if (command.kind !== "snapshot") this.mutation = false;
        return failure("stale-target");
      }
      if (this.disposed) {
        if (command.kind !== "snapshot") this.mutation = false;
        return failure("configuration-unavailable");
      }
      const child = spawn(runtime.binary, [runtime.entry], {
        cwd: directory,
        env:
          command.kind === "snapshot"
            ? { ...this.environment, BUN_RUNTIME_TRANSPILER_CACHE_PATH: "0" }
            : this.environment,
        stdio: ["pipe", "pipe", "pipe"],
      });
      this.children.add(child);
      const started = performance.now();
      const job: Job = {
        id: randomUUID(),
        child,
        url: null,
        cancelled: false,
        timedOut: false,
        scope,
        traceId: command.traceId,
        source: null,
        directory,
      };
      if (command.kind === "login") this.job = job;
      const context = {
        traceId: command.traceId,
        requestId: command.traceId,
        connectionId: job.id,
        nativeProcessInstanceId: job.id,
        operation: `configuration:${command.kind}:adapter`,
      };
      this.record({ ...context, stage: "initiated" });
      // No child stderr or raw frames enter diagnostics: auth errors can contain secrets.
      child.stderr.resume();
      let reply: ConfigurationReply = failure("configuration-unavailable");
      const lines = createInterface({
        input: child.stdout,
        crlfDelay: Infinity,
      });
      let outputBytes = 0;
      child.stdout.on("data", (chunk: Buffer) => {
        outputBytes += chunk.length;
        if (outputBytes > 8 * 1024 * 1024) {
          child.kill();
        }
      });
      lines.on("line", (line) => {
        if (outputBytes > 8 * 1024 * 1024) return;
        let raw: unknown;
        try {
          const frame = ConfigurationTransportFrameSchema.safeParse(
            JSON.parse(line),
          );
          if (!frame.success || frame.data.traceId !== command.traceId) return;
          raw = frame.data.message;
        } catch {
          return;
        }
        const snapshot = ConfigurationSnapshotSchema.safeParse(raw);
        if (
          snapshot.success &&
          snapshot.data.traceId === command.traceId &&
          sameConfigurationScope(snapshot.data.scope, scope) &&
          snapshot.data.source.cwd === directory
        ) {
          source = snapshot.data.source;
          job.source = source;
          reply = snapshot.data;
          return;
        }
        const event = ConfigurationEventSchema.safeParse(raw);
        if (
          event.success &&
          event.data.jobId === job.id &&
          event.data.traceId === command.traceId &&
          sameConfigurationScope(event.data.scope, scope) &&
          event.data.source?.cwd === directory
        ) {
          source = event.data.source;
          job.source = source;
          if (event.data.kind === "challenge")
            job.url = event.data.launchUrl ?? event.data.url;
          this.announce(event.data);
          return;
        }
        const result = ConfigurationReplySchema.safeParse(raw);
        if (
          result.success &&
          result.data.traceId === command.traceId &&
          sameConfigurationScope(result.data.scope, scope) &&
          (result.data.source === null ||
            result.data.source.cwd === directory) &&
          !(
            result.data.kind === "done" &&
            result.data.snapshot &&
            (result.data.snapshot.traceId !== command.traceId ||
              !sameConfigurationScope(result.data.snapshot.scope, scope) ||
              result.data.snapshot.source.cwd !== directory)
          )
        ) {
          source = result.data.source;
          job.source = source;
          reply = result.data;
        }
      });
      const completed = new Promise<ConfigurationReply>((resolve) => {
        const timer = setTimeout(
          () => {
            job.timedOut = true;
            child.stdin.write(JSON.stringify({ kind: "cancel" }) + "\n");
            child.kill();
          },
          command.kind === "login"
            ? 600000
            : command.kind === "refresh-catalog"
              ? 60000
              : 20000,
        );
        const finish = (
          exitCode: number | null,
          signal: NodeJS.Signals | null,
        ) => {
          clearTimeout(timer);
          lines.close();
          this.children.delete(child);
          if (command.kind !== "snapshot") this.mutation = false;
          if (this.job === job) this.job = null;
          if (job.timedOut && reply.kind !== "done")
            reply = failure("operation-timed-out");
          if (command.kind === "login")
            this.announce({
              kind: "finished",
              jobId: job.id,
              scope,
              traceId: command.traceId,
              source,
              result: job.cancelled
                ? "cancelled"
                : job.timedOut
                  ? "timed-out"
                  : reply.kind === "done"
                    ? "saved"
                    : "failed",
              ...(reply.kind === "failed" && !job.cancelled
                ? { code: reply.code }
                : {}),
            });
          // An interactive job stays bound to its original source after start;
          // snapshots and one-shot writes must still return to a live target.
          if (command.kind !== "login") {
            try {
              if (resolveDirectory() !== directory)
                reply = failure("stale-target");
            } catch {
              reply = failure("stale-target");
            }
          }
          this.record({
            ...context,
            processPid: child.pid ?? null,
            exitCode,
            exitSignal: signal ?? null,
            stage:
              reply.kind === "failed"
                ? "failed"
                : reply.kind === "snapshot" && reply.coverage !== "complete"
                  ? "unknown"
                  : "confirmed",
            durationMs: performance.now() - started,
            ...(reply.kind === "failed" ? { code: reply.code } : {}),
            ...(reply.kind === "snapshot" && reply.coverage !== "complete"
              ? {
                  code: `configuration-${reply.coverage}`,
                  causeCode: reply.issues.slice(0, 8).join(",").slice(0, 512),
                }
              : {}),
          });
          resolve(reply);
        };
        child.once("close", finish);
        child.once("error", () => {
          reply = failure("configuration-unavailable");
        });
      });
      child.stdin.on("error", () => {});
      child.stdin.write(
        JSON.stringify(
          command.kind === "login"
            ? { ...command, jobId: job.id, scope, traceId: command.traceId }
            : command,
        ) + "\n",
      );
      if (command.kind === "login") {
        this.announce({
          kind: "progress",
          jobId: job.id,
          scope,
          traceId: command.traceId,
          source,
          message: "",
        });
        void completed;
        return { kind: "started", jobId: job.id, ...replyIdentity() };
      }
      return await completed;
    } catch {
      if (command.kind !== "snapshot" && "scope" in command)
        this.mutation = false;
      return failure("configuration-unavailable");
    }
  }
  dispose(): void {
    this.disposed = true;
    for (const done of this.snapshotWaiters) done("configuration-unavailable");
    if (this.job) this.job.cancelled = true;
    for (const child of this.children) child.kill();
  }
}

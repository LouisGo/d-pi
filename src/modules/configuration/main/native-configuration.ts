import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import type { DiagnosticEvent } from "../../../platform/main/diagnostics/public";
import { managedConfigurationRuntime } from "../../../platform/omp/resources/public";
import {
  type ConfigurationCommand,
  type ConfigurationEvent,
  ConfigurationEventSchema,
  type ConfigurationReply,
  ConfigurationSnapshotSchema,
  ConfigurationTransportFrameSchema,
} from "../contracts/public";

type Job = {
  id: string;
  child: ChildProcessWithoutNullStreams;
  url: string | null;
  cancelled: boolean;
  timedOut: boolean;
};
export class NativeConfiguration {
  private job: Job | null = null;
  private mutation = false;
  private readonly children = new Set<ChildProcessWithoutNullStreams>();
  private event: ConfigurationEvent | null = null;
  private announce(event: ConfigurationEvent): void {
    this.event = event;
    this.publish(event);
  }
  currentEvent(): ConfigurationEvent | null {
    return this.event;
  }
  constructor(
    private readonly resources: string,
    private readonly directory: () => string,
    private readonly environment: NodeJS.ProcessEnv,
    private readonly publish: (event: ConfigurationEvent) => void,
    private readonly open: (url: string) => Promise<void>,
    private readonly record: (event: DiagnosticEvent) => void = () => {},
  ) {}
  async execute(command: ConfigurationCommand): Promise<ConfigurationReply> {
    const failure = (
      code: Extract<ConfigurationReply, { kind: "failed" }>["code"],
    ): ConfigurationReply => ({
      kind: "failed",
      traceId: command.traceId,
      code,
    });
    try {
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
            url.protocol !== "https:" ||
            url.username ||
            url.password ||
            !["auth.openai.com", "chatgpt.com"].includes(url.hostname)
          )
            return failure("unsafe-login-url");
          await this.open(url.href);
        }
        return { kind: "done" };
      }
      if (this.mutation && command.kind !== "snapshot")
        return failure("operation-in-progress");
      if (command.kind !== "snapshot") this.mutation = true;
      const runtime = await managedConfigurationRuntime(this.resources);
      const child = spawn(runtime.binary, [runtime.entry], {
        cwd: this.directory(),
        env: this.environment,
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
        if (snapshot.success) {
          reply = snapshot.data;
          return;
        }
        const event = ConfigurationEventSchema.safeParse(raw);
        if (event.success && event.data.jobId === job.id) {
          if (event.data.kind === "challenge") job.url = event.data.url;
          this.announce(event.data);
          return;
        }
        if (
          typeof raw === "object" &&
          raw &&
          "kind" in raw &&
          raw.kind === "done"
        )
          reply = { kind: "done" };
        else if (
          typeof raw === "object" &&
          raw &&
          "kind" in raw &&
          raw.kind === "failed"
        )
          reply = failure(
            "code" in raw && raw.code === "authentication-failed"
              ? "authentication-failed"
              : "configuration-unavailable",
          );
      });
      const completed = new Promise<ConfigurationReply>((resolve) => {
        const timer = setTimeout(
          () => {
            job.timedOut = true;
            child.stdin.write(JSON.stringify({ kind: "cancel" }) + "\n");
            child.kill();
          },
          command.kind === "login" ? 180000 : 20000,
        );
        const finish = () => {
          clearTimeout(timer);
          lines.close();
          this.children.delete(child);
          if (command.kind !== "snapshot") this.mutation = false;
          if (this.job === job) this.job = null;
          if (command.kind === "login")
            this.announce({
              kind: "finished",
              jobId: job.id,
              result: job.cancelled
                ? "cancelled"
                : job.timedOut
                  ? "timed-out"
                  : reply.kind === "done"
                    ? "saved"
                    : "failed",
            });
          this.record({
            ...context,
            stage: reply.kind === "failed" ? "failed" : "confirmed",
            durationMs: performance.now() - started,
            ...(reply.kind === "failed" ? { code: reply.code } : {}),
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
            ? { kind: "login", jobId: job.id, traceId: command.traceId }
            : command,
        ) + "\n",
      );
      if (command.kind === "login") {
        this.announce({ kind: "progress", jobId: job.id, message: "" });
        void completed;
        return { kind: "started", jobId: job.id };
      }
      return await completed;
    } catch {
      if (command.kind === "save-key" || command.kind === "login")
        this.mutation = false;
      return failure("configuration-unavailable");
    }
  }
  dispose(): void {
    if (this.job) this.job.cancelled = true;
    for (const child of this.children) child.kill();
  }
}

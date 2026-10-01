import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Cause, Deferred, Effect, Exit, Fiber, Scope } from "effect";
import {
  type ProcessIdentity,
  readProcessIdentity,
  terminateManagedGroup,
} from "../../../../platform/node/processes/public";
import type { NativeFrame } from "../../../../platform/omp/protocol/public";
import {
  FrameDecoder,
  NativeResponseSchema,
} from "../../../../platform/omp/protocol/public";
import { nativeBootstrap } from "./native-bootstrap";

export interface NativeSessionOptions {
  binary: string;
  entry?: string;
  directory: string;
  environment: NodeJS.ProcessEnv;
  sessionDirectory: string;
  // Validation supplies fixed flags. Production passes none and retains native settings.
  extraArgs?: string[];
  supervision?: { mainPid: number; mainBirth: string; token: string };
  register?: (identity: ProcessIdentity) => Promise<boolean>;
}
export type NativeObservation =
  | { kind: "frame"; frame: NativeFrame }
  | { kind: "exited"; groupStopped?: boolean }
  | { kind: "disconnected"; reason: "spawn" | "protocol" | "exit" | "write" };
interface Pending {
  command: string;
  resume: (result: Effect.Effect<NativeFrame, Error>) => void;
}
export class NativeSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, Pending>();
  private closed = false;
  private readonly ready = Deferred.makeUnsafe<void>();
  private readonly scope = Scope.makeUnsafe();
  private shutdown: Promise<void> | null = null;
  private closePromise: Promise<void> = Promise.resolve();
  private identity: ProcessIdentity | null = null;
  private groupCleanup: Promise<boolean> | null = null;
  private readonly token: string;
  constructor(
    private readonly options: NativeSessionOptions,
    private readonly observe: (event: NativeObservation) => void,
  ) {
    this.token = options.supervision?.token ?? randomUUID();
    // Registered first: request fibers are interrupted before the process is
    // released. Transport interruption is not evidence that OMP has stopped.
    Effect.runSync(
      Scope.addFinalizer(
        this.scope,
        Effect.suspend(() => this.stopChild()),
      ),
    );
  }
  async start(): Promise<void> {
    if (this.child || this.closed || this.shutdown)
      throw new Error("Native instance already used");
    const decoder = new FrameDecoder((frame) => this.frame(frame));
    const child = spawn(
      this.options.binary,
      this.options.entry
        ? ["-e", nativeBootstrap, "--", this.options.entry]
        : ["--mode", "rpc-ui", "--no-title", ...(this.options.extraArgs ?? [])],
      {
        cwd: this.options.directory,
        env: {
          ...this.options.environment,
          PI_CODING_AGENT_SESSION_DIR: this.options.sessionDirectory,
          D_PI_PROCESS_SUPERVISION: JSON.stringify({
            ...this.options.supervision,
            token: this.token,
          }),
        },
        stdio: ["pipe", "pipe", "pipe"],
        detached: process.platform !== "win32",
      },
    );
    this.child = child;
    this.closePromise = new Promise<void>((resolve) =>
      child.once("close", () => {
        this.disconnect("exit");
        // Transport failure can precede process death. Always publish the distinct
        // close evidence, even when disconnect() has already closed the transport.
        if (!child.pid) {
          this.observe({ kind: "exited" });
          resolve();
          return;
        }
        void this.cleanupGroup().then((groupStopped) => {
          this.observe({
            kind: "exited",
            ...(groupStopped ? {} : { groupStopped }),
          });
          resolve();
        });
      }),
    );
    child.once("exit", () => {
      void this.cleanupGroup();
    });
    child.on("error", () => this.disconnect("spawn"));
    child.stdin.on("error", () => this.disconnect("write"));
    child.stdout.on("data", (bytes: Buffer) => {
      try {
        decoder.push(bytes);
      } catch {
        this.disconnect("protocol");
        child.stdin.end();
      }
    });
    child.stdout.on("end", () => {
      try {
        decoder.end();
      } catch {
        this.disconnect("protocol");
      }
    });
    // Always drain stderr. Neither raw provider errors nor business content enters logs.
    child.stderr.on("data", () => {});
    try {
      // Install all stream/error listeners before the first asynchronous read.
      if (!this.options.entry && child.pid)
        this.identity = await readProcessIdentity(child.pid);
      await this.run(
        Deferred.await(this.ready).pipe(
          Effect.timeoutOrElse({
            duration: 30000,
            orElse: () => Effect.fail(new Error("Native startup timed out")),
          }),
        ),
        "Native startup interrupted",
      );
      const response = await this.request("negotiate_protocol", {
        protocolVersion: 2,
      });
      if (response.success !== true)
        throw new Error("Native protocol negotiation failed");
    } catch (error) {
      await this.close();
      throw error;
    }
  }
  private frame(frame: NativeFrame): void {
    if (frame.type === "d_pi_native_bootstrap") {
      if (frame.token !== this.token || !this.child?.pid) {
        this.child?.stdin.end();
        return;
      }
      void this.register();
      return;
    }
    if (frame.type === "ready") {
      Deferred.doneUnsafe(this.ready, Effect.void);
    }
    const response = NativeResponseSchema.safeParse(frame);
    if (frame.type === "response" && !response.success) {
      this.disconnect("protocol");
      this.child?.stdin.end();
      return;
    }
    if (response.success && response.data.id) {
      const pending = this.pending.get(response.data.id);
      if (pending && pending.command === response.data.command) {
        this.pending.delete(response.data.id);
        pending.resume(Effect.succeed(frame));
      }
    }
    this.observe({ kind: "frame", frame });
  }
  private async register(): Promise<void> {
    const pid = this.child?.pid;
    if (!pid) return;
    try {
      this.identity = await readProcessIdentity(pid);
      const allowed =
        !!this.identity &&
        this.identity.parentPid === process.pid &&
        this.identity.groupId === pid &&
        ((await this.options.register?.(this.identity)) ?? true);
      if (!this.closed && !this.shutdown && this.child)
        this.child.stdin.write(
          `${JSON.stringify({ type: "d_pi_native_permit", token: this.token, allowed })}\n`,
        );
    } catch {
      this.child?.stdin.end();
    }
  }
  private cleanupGroup(): Promise<boolean> {
    this.groupCleanup ??= this.identity
      ? terminateManagedGroup(this.identity)
      : Promise.resolve(false);
    return this.groupCleanup;
  }
  request(
    command: string,
    fields: Record<string, unknown> = {},
  ): Promise<NativeFrame> {
    if (this.closed || this.shutdown || !this.child || this.pending.size >= 64)
      return Promise.reject(new Error("Native connection unavailable"));
    const id = randomUUID();
    const response = Effect.callback<NativeFrame, Error>((resume) => {
      this.pending.set(id, { command, resume });
      try {
        this.write(`${JSON.stringify({ ...fields, id, type: command })}\n`);
      } catch (error) {
        resume(
          Effect.fail(
            error instanceof Error ? error : new Error("Native write failed"),
          ),
        );
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: 30000,
        orElse: () => Effect.fail(new Error("Native command timed out")),
      }),
      Effect.ensuring(Effect.sync(() => this.pending.delete(id))),
    );
    return this.run(response, "Native connection interrupted");
  }
  // Effect stays inside this adapter. Preserve ordinary Error rejection and
  // distinguish local interruption from request timeout or write failure.
  private async run<A>(
    effect: Effect.Effect<A, Error>,
    interrupted: string,
  ): Promise<A> {
    const fiber = Effect.runSync(
      Effect.forkIn(effect, this.scope, { startImmediately: true }),
    );
    const result = await Effect.runPromiseExit(Fiber.join(fiber));
    if (Exit.isSuccess(result)) return result.value;
    if (result.cause.reasons.every(Cause.isInterruptReason))
      throw new Error(interrupted);
    throw Cause.squash(result.cause);
  }
  write(frame: string): void {
    if (
      this.closed ||
      this.shutdown ||
      !this.child ||
      this.child.stdin.destroyed
    )
      throw new Error("Native connection closed");
    if (
      Buffer.byteLength(frame) > 1048576 ||
      this.child.stdin.writableLength > 1048576
    )
      throw new Error("Native input budget exceeded");
    this.child.stdin.write(frame);
  }
  private disconnect(
    reason: Extract<NativeObservation, { kind: "disconnected" }>["reason"],
  ): void {
    if (this.closed) return;
    this.closed = true;
    void this.close();
    this.observe({ kind: "disconnected", reason });
  }
  // Owner calls this only for failed startup or verified idle shutdown. Busy close is S3.
  close(): Promise<void> {
    // Memoize the entire finalization, not only the process close event.
    this.shutdown ??= Effect.runPromise(Scope.close(this.scope, Exit.void));
    return this.shutdown;
  }
  private stopChild(): Effect.Effect<void> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null)
      return Effect.promise(() => this.closePromise);
    child.stdin.end();
    return Effect.promise(() => this.closePromise).pipe(
      Effect.interruptible,
      Effect.timeoutOrElse({
        duration: 3000,
        orElse: () =>
          Effect.gen({ self: this }, function* () {
            yield* Effect.promise(() => this.cleanupGroup());
            if (child.exitCode === null && child.signalCode === null)
              child.kill("SIGKILL");
            yield* Effect.promise(() => this.closePromise);
          }),
      }),
    );
  }
}

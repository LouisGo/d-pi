import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as Cause from "effect/Cause";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
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
import {
  NativeTerminationSchema,
  type ProcessExitEvidence,
} from "../../contracts/host";
import type { NativeFailureSummary } from "../../contracts/native-failure";
import { nativeBootstrap } from "./native-bootstrap";
import {
  NativeRequestFailure,
  nativeOperation,
} from "./native-request-failure";

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
  | { kind: "exited"; groupStopped?: boolean; evidence?: ProcessExitEvidence }
  | {
      kind: "disconnected";
      reason: "spawn" | "protocol" | "exit" | "write" | "unknown";
      failure?: NativeFailureSummary;
    };
interface Pending {
  command: string;
  resume: (result: Effect.Effect<NativeFrame, Error>) => void;
}
class NativeObservationFailure extends Error {
  constructor() {
    super("Native observation failed");
  }
}
export class NativeSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, Pending>();
  private closed = false;
  private transportFailure:
    | "spawn"
    | "protocol"
    | "write"
    | "unavailable"
    | "unknown"
    | null = null;
  private readonly ready = Deferred.makeUnsafe<void>();
  private readonly scope = Scope.makeUnsafe();
  private shutdown: Promise<void> | null = null;
  private closePromise: Promise<void> = Promise.resolve();
  private identity: ProcessIdentity | null = null;
  private groupCleanup: Promise<boolean> | null = null;
  private readonly token: string;
  private termination: Pick<
    ProcessExitEvidence,
    "reason" | "requestedExitCode"
  > = {
    reason: null,
    requestedExitCode: null,
  };
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
      throw new NativeRequestFailure(
        { kind: "unavailable", operation: "startup" },
        "Native instance already used",
      );
    const decoder = new FrameDecoder((frame) => {
      // FrameDecoder calls its consumer synchronously. A valid frame whose
      // application observer throws cannot establish a native protocol fault.
      try {
        this.frame(frame);
      } catch {
        throw new NativeObservationFailure();
      }
    });
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(
        this.options.binary,
        this.options.entry
          ? ["-e", nativeBootstrap, "--", this.options.entry]
          : [
              "--mode",
              "rpc-ui",
              "--no-title",
              ...(this.options.extraArgs ?? []),
            ],
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
    } catch {
      throw new NativeRequestFailure(
        { kind: "spawn", operation: "startup" },
        "Native spawn failed",
      );
    }
    this.child = child;
    this.closePromise = new Promise<void>((resolve) =>
      child.once("close", (exitCode, signal) => {
        const evidence: ProcessExitEvidence = {
          process: "native",
          pid: child.pid ?? null,
          exitCode: exitCode ?? null,
          signal: signal ?? null,
          ...this.termination,
        };
        this.disconnect("exit");
        // Transport failure can precede process death. Always publish the distinct
        // close evidence, even when disconnect() has already closed the transport.
        if (!child.pid) {
          this.observe({ kind: "exited", evidence });
          resolve();
          return;
        }
        void this.cleanupGroup().then((groupStopped) => {
          this.observe({
            kind: "exited",
            evidence,
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
      } catch (error: unknown) {
        this.disconnect(
          error instanceof NativeObservationFailure ? "unknown" : "protocol",
        );
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
            orElse: () =>
              Effect.fail(
                new NativeRequestFailure(
                  { kind: "timeout", operation: "startup", timeoutMs: 30000 },
                  "Native startup timed out",
                ),
              ),
          }),
        ),
        "Native startup interrupted",
        "startup",
      );
      const response = await this.request("negotiate_protocol", {
        protocolVersion: 2,
      });
      if (response.success !== true)
        throw new NativeRequestFailure(
          { kind: "protocol", operation: "negotiate_protocol" },
          "Native protocol negotiation failed",
        );
    } catch (error) {
      await this.close();
      throw error;
    }
  }
  private frame(frame: NativeFrame): void {
    if (frame.type === "d_pi_native_termination") {
      if (frame.token !== this.token) return;
      const parsed = NativeTerminationSchema.safeParse({
        reason: frame.reason,
        requestedExitCode: frame.requestedExitCode,
      });
      if (parsed.success) this.termination = parsed.data;
      return;
    }
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
    options: { signal?: AbortSignal } = {},
  ): Promise<NativeFrame> {
    if (options.signal?.aborted)
      return Promise.reject(
        new NativeRequestFailure(
          { kind: "interrupted", operation: nativeOperation(command) },
          "Native connection interrupted",
        ),
      );
    if (this.closed || this.shutdown || !this.child || this.pending.size >= 64)
      return Promise.reject(
        new NativeRequestFailure(
          {
            kind: "unavailable",
            operation: nativeOperation(command),
            ...(this.pending.size >= 64 ? { budget: "request-limit" } : {}),
          },
          "Native connection unavailable",
        ),
      );
    const id = randomUUID();
    let frame: string;
    try {
      frame = `${JSON.stringify({ ...fields, id, type: command })}\n`;
    } catch {
      return Promise.reject(Error("Native request encoding failed"));
    }
    const response = Effect.callback<NativeFrame, Error>((resume) => {
      this.pending.set(id, { command, resume });
      try {
        this.write(frame);
      } catch (error) {
        resume(
          Effect.fail(
            error instanceof NativeRequestFailure
              ? new NativeRequestFailure(
                  {
                    ...error.failure,
                    operation: nativeOperation(command),
                    requestId: id,
                  },
                  error.message,
                )
              : Error("Native write failed"),
          ),
        );
      }
    }).pipe(
      Effect.timeoutOrElse({
        duration: 30000,
        orElse: () =>
          Effect.fail(
            new NativeRequestFailure(
              {
                kind: "timeout",
                operation: nativeOperation(command),
                requestId: id,
                timeoutMs: 30000,
              },
              "Native command timed out",
            ),
          ),
      }),
      Effect.ensuring(Effect.sync(() => this.pending.delete(id))),
    );
    return this.run(
      response,
      "Native connection interrupted",
      command,
      id,
      options.signal,
    );
  }
  // Effect stays inside this adapter. Preserve ordinary Error rejection and
  // distinguish local interruption from request timeout or write failure.
  private async run<A>(
    effect: Effect.Effect<A, Error>,
    interrupted: string,
    operation: string,
    requestId?: string,
    signal?: AbortSignal,
  ): Promise<A> {
    const fiber = Effect.runSync(
      Effect.forkIn(effect, this.scope, { startImmediately: true }),
    );
    const interrupt = () => {
      void Effect.runPromise(Fiber.interrupt(fiber));
    };
    signal?.addEventListener("abort", interrupt, { once: true });
    if (signal?.aborted) interrupt();
    const result = await Effect.runPromiseExit(Fiber.join(fiber)).finally(
      () => {
        signal?.removeEventListener("abort", interrupt);
      },
    );
    if (Exit.isSuccess(result)) return result.value;
    if (result.cause.reasons.every(Cause.isInterruptReason)) {
      if (this.transportFailure === "unknown")
        throw new NativeObservationFailure();
      throw new NativeRequestFailure(
        {
          kind: this.transportFailure ?? "interrupted",
          operation: nativeOperation(operation),
          ...(requestId ? { requestId } : {}),
        },
        interrupted,
      );
    }
    throw Cause.squash(result.cause);
  }
  write(frame: string): void {
    if (
      this.closed ||
      this.shutdown ||
      !this.child ||
      this.child.stdin.destroyed
    )
      throw new NativeRequestFailure(
        { kind: "unavailable", operation: "write" },
        "Native connection closed",
      );
    if (
      Buffer.byteLength(frame) > 1048576 ||
      this.child.stdin.writableLength > 1048576
    )
      throw new NativeRequestFailure(
        { kind: "write", operation: "write", budget: "input-budget" },
        "Native input budget exceeded",
      );
    try {
      this.child.stdin.write(frame);
    } catch {
      throw new NativeRequestFailure(
        { kind: "write", operation: "write" },
        "Native write failed",
      );
    }
  }
  private disconnect(
    reason: Extract<NativeObservation, { kind: "disconnected" }>["reason"],
  ): void {
    if (this.closed) return;
    this.transportFailure = reason === "exit" ? "unavailable" : reason;
    this.closed = true;
    void this.close();
    this.observe({
      kind: "disconnected",
      reason,
      ...(this.transportFailure === "unknown"
        ? {}
        : { failure: { kind: this.transportFailure, operation: "unknown" } }),
    });
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

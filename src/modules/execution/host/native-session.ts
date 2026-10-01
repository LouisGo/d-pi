import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  type ProcessIdentity,
  readProcessIdentity,
  terminateManagedGroup,
} from "../../../platform/node/processes/public";
import type { NativeFrame } from "../../../platform/omp/protocol/public";
import {
  FrameDecoder,
  NativeResponseSchema,
} from "../../../platform/omp/protocol/public";
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
  resolve: (frame: NativeFrame) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
export class NativeSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly pending = new Map<string, Pending>();
  private closed = false;
  private ready: {
    resolve: () => void;
    reject: (error: Error) => void;
  } | null = null;
  private closePromise: Promise<void> = Promise.resolve();
  private identity: ProcessIdentity | null = null;
  private groupCleanup: Promise<boolean> | null = null;
  private readonly token: string;
  constructor(
    private readonly options: NativeSessionOptions,
    private readonly observe: (event: NativeObservation) => void,
  ) {
    this.token = options.supervision?.token ?? randomUUID();
  }
  async start(): Promise<void> {
    if (this.child || this.closed)
      throw new Error("Native instance already used");
    const started = new Promise<void>((resolve, reject) => {
      this.ready = { resolve, reject };
    });
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
    if (!this.options.entry && child.pid)
      this.identity = await readProcessIdentity(child.pid);
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
    const timer = setTimeout(() => {
      this.ready?.reject(new Error("Native startup timed out"));
      this.ready = null;
    }, 30000);
    try {
      await started;
      const response = await this.request("negotiate_protocol", {
        protocolVersion: 2,
      });
      if (response.success !== true)
        throw new Error("Native protocol negotiation failed");
    } catch (error) {
      await this.close();
      throw error;
    } finally {
      clearTimeout(timer);
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
      this.ready?.resolve();
      this.ready = null;
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
        clearTimeout(pending.timer);
        this.pending.delete(response.data.id);
        pending.resolve(frame);
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
      if (!this.closed && this.child)
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
    if (this.closed || !this.child || this.pending.size >= 64)
      return Promise.reject(new Error("Native connection unavailable"));
    const id = randomUUID();
    return new Promise<NativeFrame>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Native command timed out"));
      }, 30000);
      this.pending.set(id, { command, resolve, reject, timer });
      try {
        this.write(`${JSON.stringify({ ...fields, id, type: command })}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(
          error instanceof Error ? error : new Error("Native write failed"),
        );
      }
    });
  }
  write(frame: string): void {
    if (this.closed || !this.child || this.child.stdin.destroyed)
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
    this.ready?.reject(new Error("Native startup interrupted"));
    this.ready = null;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Native connection interrupted"));
    }
    this.pending.clear();
    this.observe({ kind: "disconnected", reason });
  }
  // Owner calls this only for failed startup or verified idle shutdown. Busy close is S3.
  async close(): Promise<void> {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null)
      return this.closePromise;
    child.stdin.end();
    const timer = setTimeout(() => {
      void this.cleanupGroup();
      child.kill("SIGKILL");
    }, 3000);
    try {
      await this.closePromise;
    } finally {
      clearTimeout(timer);
    }
  }
}

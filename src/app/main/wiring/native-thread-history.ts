import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { SessionExecutionLease } from "../../../modules/execution/main/public";
import type {
  NativeSessionBinding,
  ThreadContext,
} from "../../../modules/threads/contracts/public";
import {
  readProcessIdentity,
  sessionExecutionOwners,
  terminateManagedGroup,
} from "../../../platform/node/processes/public";
import { managedThreadHistoryRuntime } from "../../../platform/omp/resources/public";

const ResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("deleted") }),
  z.strictObject({
    kind: z.literal("forked"),
    file: z.string().min(1),
    sessionId: z.string().min(1),
  }),
]);
export class NativeThreadHistory {
  constructor(
    private readonly resources: string,
    private readonly data: string,
  ) {}
  async execute(
    kind: "fork" | "delete",
    thread: ThreadContext,
    binding: NativeSessionBinding,
    destinationId?: string,
    retry = false,
  ) {
    const root =
      binding.historyRoot ??
      join(this.data, "native-sessions", thread.threadId);
    const identity = await readProcessIdentity(process.pid);
    if (!identity) throw Error("Main identity unavailable");
    const leaseRoot =
      binding.origin === "cli"
        ? join(
            root,
            ".d-pi-ownership",
            createHash("sha256").update(binding.sessionFile).digest("hex"),
          )
        : root;
    const lease = await SessionExecutionLease.acquire(leaseRoot, identity);
    let stopped = true;
    try {
      const owners = await sessionExecutionOwners(
        binding.sessionFile,
        thread.directory,
      );
      if (owners.length) throw Error("Native session occupied");
      const runtime = await managedThreadHistoryRuntime(this.resources);
      const destination = destinationId
        ? join(this.data, "native-sessions", destinationId)
        : undefined;
      if (destination)
        await mkdir(destination, { recursive: true, mode: 0o700 });
      const child = spawn(runtime.binary, [runtime.entry], {
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          D_PI_THREAD_HISTORY: JSON.stringify({
            kind,
            mainPid: identity.pid,
            mainBirth: identity.birth,
            root,
            file: binding.sessionFile,
            sessionId: binding.sessionId,
            directory: thread.directory,
            destination,
            retry,
          }),
        },
      });
      stopped = false;
      let stdout = "",
        failed = false;
      const exit = new Promise<void>((resolve, reject) => {
        child.once("error", () => {
          failed = true;
        });
        child.once("close", (code) => {
          stopped = true;
          code === 0 && !failed
            ? resolve()
            : reject(Error("Native history operation failed"));
        });
        child.stdout.on("data", (chunk) => {
          stdout += String(chunk);
          if (stdout.length > 65536) {
            failed = true;
            child.kill("SIGKILL");
          }
        });
        child.stderr.on("data", () => {});
        child.stdin.on("error", () => {});
      });
      // Observe errors immediately, before asynchronous registration. The worker
      // waits for stdin permission, and its identity survives a Main crash.
      void exit.catch(() => {});
      let worker;
      try {
        worker = child.pid ? await readProcessIdentity(child.pid) : null;
        if (worker && worker.groupId === worker.pid) lease.register(worker);
      } catch (error) {
        // No permit was granted. EOF makes this worker exit before history access.
        child.stdin.end();
        await exit.catch(() => {});
        throw error;
      }
      if (!worker || worker.groupId !== worker.pid) {
        child.stdin.end();
        await exit;
        throw Error("Worker identity unavailable");
      }
      const timeout = setTimeout(() => {
        failed = true;
        void terminateManagedGroup(worker);
      }, 30000);
      try {
        child.stdin.end("permit\n");
        await exit;
        return ResultSchema.parse(JSON.parse(stdout));
      } finally {
        clearTimeout(timeout);
        if (!stopped) stopped = await terminateManagedGroup(worker);
      }
    } finally {
      lease.release(stopped);
    }
  }
}

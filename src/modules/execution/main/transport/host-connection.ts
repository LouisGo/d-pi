import { createHash } from "node:crypto";
import { join } from "node:path";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import { type UtilityProcess, utilityProcess } from "electron";
import {
  type ProcessIdentity,
  readProcessIdentity,
  sessionExecutionOwners,
  terminateManagedGroup,
} from "../../../../platform/node/processes/public";
import {
  type HostCommand,
  type HostMessage,
  type HostStart,
  HostTransportMessageSchema,
  type ProcessExitEvidence,
} from "../../contracts/public";

import { NativeRecoveryFailure } from "../../core/runtime/native-recovery-failure";
import { SessionExecutionLease } from "./session-execution-lease";

type ReadyMessage = Extract<HostMessage, { kind: "ready" }>;
type Ready = ReadyMessage & {
  state: ReadyMessage["state"] & { sessionFile: string };
};
type ScopeListener = {
  message: (message: HostMessage | { kind: "scope-closed" }) => void;
  exit: (evidence?: ProcessExitEvidence) => void;
};
type OperationResult = Extract<HostMessage, { kind: "operation-result" }>;
type OperationWaiter = {
  finish: (result: OperationResult) => void;
  unknown: OperationResult;
};
let sharedHost: UtilityProcess | null = null;
const scopes = new Map<string, ScopeListener>();
function hostProcess(): UtilityProcess {
  if (sharedHost) return sharedHost;
  const host = utilityProcess.fork(
    join(import.meta.dirname, "session-host.js"),
    [],
    { serviceName: "d-pi SessionHost" },
  );
  sharedHost = host;
  let pid = host.pid ?? null;
  host.on("spawn", () => {
    pid = host.pid ?? null;
  });
  host.on("message", (raw: unknown) => {
    if (sharedHost !== host) return;
    const parsed = HostTransportMessageSchema.safeParse(raw);
    if (parsed.success)
      scopes.get(parsed.data.scopeId)?.message(parsed.data.message);
  });
  host.on("exit", (exitCode: number) => {
    if (sharedHost !== host) return;
    sharedHost = null;
    const previous = [...scopes.values()];
    scopes.clear();
    for (const scope of previous)
      scope.exit({
        process: "utility",
        pid,
        exitCode,
        signal: null,
        reason: null,
        requestedExitCode: null,
      });
  });
  return host;
}
// Process/transport ownership only. It cannot grant trust or persist business receipts.
export class HostConnection {
  private readonly operationWaiters = new Map<string, OperationWaiter>();
  private waitScope = Scope.makeUnsafe("parallel");
  // One task owner per connection generation. Public methods keep ordinary
  // Promise/Error results; transport interruption is never process-stop evidence.
  private async run<A, E>(
    effect: Effect.Effect<A, E>,
    scope = this.waitScope,
  ): Promise<A> {
    const fiber = Effect.runSync(
      Effect.forkIn(effect, scope, { startImmediately: true }),
    );
    const result = await Effect.runPromiseExit(Fiber.join(fiber));
    if (Exit.isSuccess(result)) return result.value;
    throw Cause.squash(result.cause);
  }
  private finishOperations(): void {
    for (const waiter of this.operationWaiters.values())
      waiter.finish(waiter.unknown);
    this.operationWaiters.clear();
  }
  operation(
    command:
      | Extract<
          HostCommand,
          { kind: "manage-queue" | "configure-subagent" | "select-model" }
        >
      | { kind: "state"; traceId: string; connectionGeneration: string },
  ): Promise<Extract<HostMessage, { kind: "operation-result" }>> {
    const target =
      command.kind === "state"
        ? command
        : command.kind === "select-model"
          ? {
              traceId: command.command.traceId,
              connectionGeneration: command.connectionGeneration,
            }
          : command.command;
    const unknown = {
      kind: "operation-result" as const,
      traceId: target.traceId,
      connectionGeneration: target.connectionGeneration,
      operation: command.kind === "state" ? ("inspect" as const) : command.kind,
      status: "unknown" as const,
    };
    if (!this.connected) return Promise.resolve(unknown);
    let waiter: OperationWaiter;
    return this.run(
      Effect.callback<OperationResult>((resume) => {
        waiter = {
          finish: (result) => {
            if (
              result.connectionGeneration === target.connectionGeneration &&
              result.operation === unknown.operation
            )
              resume(Effect.succeed(result));
          },
          unknown,
        };
        this.operationWaiters.set(target.traceId, waiter);
        try {
          this.send(command);
        } catch {
          resume(Effect.succeed(unknown));
        }
      }).pipe(
        Effect.timeoutOrElse({
          duration: 12000,
          orElse: () => Effect.succeed(unknown),
        }),
        Effect.ensuring(
          Effect.sync(() => {
            if (this.operationWaiters.get(target.traceId) === waiter)
              this.operationWaiters.delete(target.traceId);
          }),
        ),
      ),
    );
  }
  private scopeId: string | null = null;
  private startDispatched = false;
  get startAttempted(): boolean {
    return this.startDispatched;
  }
  private cleanup: Promise<boolean> | null = null;
  private closeListeners = new Set<(confirmed: boolean) => void>();
  constructor(
    private readonly receive: (
      message: Exclude<HostMessage, { kind: "ready" | "native-register" }>,
    ) => void,
    private readonly exited: (evidence?: ProcessExitEvidence) => void,
    private readonly closed: (confirmed: boolean) => void = () => {},
  ) {}
  get connected(): boolean {
    return this.scopeId !== null;
  }
  async start(
    command: HostStart,
    ready: (message: Ready) => void,
    validateAdmission: () => void = () => {},
  ): Promise<void> {
    if (this.scopeId) return Promise.reject(Error("Host already connected"));
    this.startDispatched = false;
    const main = await readProcessIdentity(process.pid);
    if (!main) throw new NativeRecoveryFailure("owner-unknown");
    const lease = await SessionExecutionLease.acquire(
      command.resume?.origin === "cli"
        ? join(
            command.sessionDirectory,
            ".d-pi-ownership",
            createHash("sha256")
              .update(command.resume.sessionFile)
              .digest("hex"),
          )
        : command.sessionDirectory,
      main,
    );
    if (command.resume?.origin === "cli") {
      try {
        // Take the shared d-pi lifetime lease first (including stale owned-group
        // cleanup), then check the original file for an existing external writer.
        // An unmodified CLI does not honor our lease; never claim otherwise.
        if (
          (
            await sessionExecutionOwners(
              command.resume.sessionFile,
              command.identity.directory,
            )
          ).length
        )
          throw new NativeRecoveryFailure("occupied");
      } catch (error) {
        lease.release(true);
        throw error instanceof NativeRecoveryFailure
          ? error
          : new NativeRecoveryFailure("owner-unknown");
      }
    }
    let host: UtilityProcess;
    try {
      // Recheck trust after asynchronous identity/ownership probes.
      validateAdmission();
      host = hostProcess();
    } catch (error) {
      lease.release(true);
      throw error;
    }
    const supervision = {
      mainPid: process.pid,
      mainBirth: main.birth,
      token: crypto.randomUUID(),
    };
    command = { ...command, supervision };
    let nativeIdentity: ProcessIdentity | null = null;
    this.scopeId = command.processInstanceId;
    const waitScope = Scope.makeUnsafe("parallel");
    const closeListeners = new Set<(confirmed: boolean) => void>();
    this.waitScope = waitScope;
    this.closeListeners = closeListeners;
    let awaitingReady = true;
    const startup = Effect.callback<void, unknown>((resume) => {
      const accept = () => {
        awaitingReady = false;
        resume(Effect.void);
      };
      const reject = (error: unknown) => {
        awaitingReady = false;
        resume(Effect.fail(error));
      };
      const exit = (evidence?: ProcessExitEvidence) => {
        if (this.scopeId !== command.processInstanceId) return;
        scopes.delete(command.processInstanceId);
        this.scopeId = null;
        this.finishOperations();
        this.exited(evidence);
        this.cleanup = nativeIdentity
          ? terminateManagedGroup(nativeIdentity)
          : Promise.resolve(true);
        this.cleanup = this.cleanup.then((stopped) => lease.release(stopped));
        void this.cleanup.then((confirmed) => {
          this.closed(confirmed);
          if (!confirmed)
            this.receive({
              kind: "interrupted",
              reason: "process-group-unconfirmed",
            });
          for (const listener of closeListeners) listener(confirmed);
          // Close wait fibers only after real group cleanup has resolved the
          // listeners. A local interruption cannot confirm physical shutdown.
          void Effect.runPromise(Scope.close(waitScope, Exit.void));
        });
        reject(Error("Host exited"));
      };
      scopes.set(command.processInstanceId, {
        exit,
        message: (message) => {
          if (message.kind === "native-register") {
            const registration = message.registration;
            void readProcessIdentity(registration.pid).then((actual) => {
              let allowed =
                awaitingReady &&
                !!actual &&
                actual.birth === registration.birth &&
                actual.executable === registration.executable &&
                actual.groupId === actual.pid &&
                actual.parentPid === host.pid &&
                registration.processInstanceId === command.processInstanceId &&
                registration.token === supervision.token;
              if (
                allowed &&
                actual &&
                this.scopeId === command.processInstanceId
              ) {
                try {
                  validateAdmission();
                  // Persist cleanup identity before granting permission to import SDK.
                  lease.register(actual);
                  nativeIdentity = actual;
                } catch {
                  allowed = false;
                }
              }
              if (
                sharedHost === host &&
                this.scopeId === command.processInstanceId
              )
                host.postMessage({
                  scopeId: command.processInstanceId,
                  command: {
                    kind: "native-permit",
                    processInstanceId: command.processInstanceId,
                    token: supervision.token,
                    allowed,
                  },
                });
              else if (actual && allowed) void terminateManagedGroup(actual);
            });
            return;
          }
          if (message.kind === "scope-closed") {
            exit();
            if (!scopes.size && sharedHost === host) {
              sharedHost = null;
              host.kill();
            }
            return;
          }
          if (message.kind === "ready") {
            if (
              !awaitingReady ||
              message.processInstanceId !== command.processInstanceId ||
              message.connectionGeneration !== command.connectionGeneration
            )
              return;
            if (!message.state.sessionFile) {
              reject(Error("Native reference missing"));
              return;
            }
            try {
              // Complete binding synchronously before a subsequent state/exit event.
              ready({
                ...message,
                state: {
                  ...message.state,
                  sessionFile: message.state.sessionFile,
                },
              });
              accept();
            } catch (error) {
              reject(error);
            }
          } else {
            this.receive(message);
            if (message.kind === "operation-result")
              this.operationWaiters.get(message.traceId)?.finish(message);
            if (message.kind === "interrupted" || message.kind === "failed")
              this.finishOperations();
            if (message.kind === "failed" || message.kind === "interrupted") {
              reject(Error("Host unavailable"));
            }
          }
        },
      });
      this.startDispatched = true;
      host.postMessage({ scopeId: command.processInstanceId, command });
    });
    return this.run(
      startup.pipe(
        Effect.ensuring(
          Effect.sync(() => {
            awaitingReady = false;
          }),
        ),
        Effect.timeoutOrElse({
          duration: 35000,
          orElse: () =>
            Effect.suspend(() => {
              try {
                host.postMessage({
                  scopeId: command.processInstanceId,
                  command: { kind: "close-idle" },
                });
              } catch {
                // Keep the original timeout result; failed dispatch cannot prove exit.
              }
              return Effect.fail(Error("Host startup timeout"));
            }),
        }),
      ),
      waitScope,
    );
  }
  send(command: HostCommand): void {
    if (!this.scopeId || !sharedHost) throw Error("Host unavailable");
    sharedHost.postMessage({ scopeId: this.scopeId, command });
  }
  attach(port: Electron.MessagePortMain): void {
    if (!this.scopeId || !sharedHost) {
      port.close();
      return;
    }
    sharedHost.postMessage(
      { scopeId: this.scopeId, command: { kind: "attach" } },
      [port],
    );
  }
  async closeIdle(): Promise<void> {
    if (!this.connected) {
      if (this.cleanup && !(await this.cleanup))
        throw Error("Process group shutdown unconfirmed");
      return;
    }
    const listeners = this.closeListeners;
    let done: (confirmed: boolean) => void;
    await this.run(
      Effect.callback<void, unknown>((resume) => {
        done = (confirmed) =>
          resume(
            confirmed
              ? Effect.void
              : Effect.fail(Error("Process group shutdown unconfirmed")),
          );
        listeners.add(done);
        try {
          this.send({ kind: "close-idle" });
        } catch (error) {
          resume(Effect.fail(error));
        }
      }).pipe(
        Effect.timeoutOrElse({
          duration: 5000,
          orElse: () => Effect.fail(Error("Idle close not confirmed")),
        }),
        Effect.ensuring(Effect.sync(() => listeners.delete(done))),
      ),
    );
  }
}

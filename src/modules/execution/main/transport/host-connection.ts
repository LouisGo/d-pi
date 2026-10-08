import { join } from "node:path";
import { Effect } from "effect";
import { type UtilityProcess, utilityProcess } from "electron";
import {
  type ProcessIdentity,
  readProcessIdentity,
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
  private readonly operationWaiters = new Map<
    string,
    {
      finish: (
        result: Extract<HostMessage, { kind: "operation-result" }>,
      ) => void;
      unknown: Extract<HostMessage, { kind: "operation-result" }>;
    }
  >();
  private finishOperations(): void {
    for (const waiter of this.operationWaiters.values())
      waiter.finish(waiter.unknown);
    this.operationWaiters.clear();
  }
  operation(
    command:
      | Extract<HostCommand, { kind: "manage-queue" | "configure-subagent" }>
      | { kind: "state"; traceId: string; connectionGeneration: string },
  ): Promise<Extract<HostMessage, { kind: "operation-result" }>> {
    const target = command.kind === "state" ? command : command.command;
    const unknown = {
      kind: "operation-result" as const,
      traceId: target.traceId,
      connectionGeneration: target.connectionGeneration,
      operation: command.kind === "state" ? ("inspect" as const) : command.kind,
      status: "unknown" as const,
    };
    return Effect.runPromise(
      Effect.callback<
        Extract<HostMessage, { kind: "operation-result" }>,
        Error
      >((resume) => {
        this.operationWaiters.set(target.traceId, {
          finish: (result) => {
            if (
              result.connectionGeneration === target.connectionGeneration &&
              result.operation === unknown.operation
            )
              resume(Effect.succeed(result));
          },
          unknown,
        });
        try {
          this.send(command);
        } catch {
          resume(Effect.succeed(unknown));
        }
        return Effect.sync(() => {
          this.operationWaiters.delete(target.traceId);
        });
      }).pipe(
        Effect.timeoutOrElse({
          duration: 12000,
          orElse: () => Effect.succeed(unknown),
        }),
      ),
    );
  }
  private scopeId: string | null = null;
  private startDispatched = false;
  get startAttempted(): boolean {
    return this.startDispatched;
  }
  private cleanup: Promise<boolean> | null = null;
  private readonly closeListeners = new Set<(confirmed: boolean) => void>();
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
  ): Promise<void> {
    if (this.scopeId) return Promise.reject(Error("Host already connected"));
    this.startDispatched = false;
    const main = await readProcessIdentity(process.pid);
    if (!main) throw new NativeRecoveryFailure("owner-unknown");
    const lease = await SessionExecutionLease.acquire(
      command.sessionDirectory,
      main,
    );
    let host: UtilityProcess;
    try {
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
    return new Promise((accept, reject) => {
      const timeout = setTimeout(() => {
        reject(Error("Host startup timeout"));
        host.postMessage({
          scopeId: command.processInstanceId,
          command: { kind: "close-idle" },
        });
      }, 35000);
      const exit = (evidence?: ProcessExitEvidence) => {
        clearTimeout(timeout);
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
          for (const listener of this.closeListeners) listener(confirmed);
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
              message.processInstanceId !== command.processInstanceId ||
              message.connectionGeneration !== command.connectionGeneration
            )
              return;
            clearTimeout(timeout);
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
              clearTimeout(timeout);
              reject(Error("Host unavailable"));
            }
          }
        },
      });
      this.startDispatched = true;
      host.postMessage({ scopeId: command.processInstanceId, command });
    });
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
    await new Promise<void>((accept, reject) => {
      const done = (confirmed: boolean) => {
        clearTimeout(timer);
        this.closeListeners.delete(done);
        if (confirmed) accept();
        else reject(Error("Process group shutdown unconfirmed"));
      };
      const timer = setTimeout(() => {
        this.closeListeners.delete(done);
        reject(Error("Idle close not confirmed"));
      }, 5000);
      this.closeListeners.add(done);
      this.send({ kind: "close-idle" });
    });
  }
}

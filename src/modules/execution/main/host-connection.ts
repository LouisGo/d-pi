import { join } from "node:path";
import { type UtilityProcess, utilityProcess } from "electron";
import {
  type HostCommand,
  type HostMessage,
  type HostStart,
  HostTransportMessageSchema,
} from "../contracts/public";

type ReadyMessage = Extract<HostMessage, { kind: "ready" }>;
type Ready = ReadyMessage & {
  state: ReadyMessage["state"] & { sessionFile: string };
};
type ScopeListener = {
  message: (message: HostMessage | { kind: "scope-closed" }) => void;
  exit: () => void;
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
  host.on("message", (raw: unknown) => {
    if (sharedHost !== host) return;
    const parsed = HostTransportMessageSchema.safeParse(raw);
    if (parsed.success)
      scopes.get(parsed.data.scopeId)?.message(parsed.data.message);
  });
  host.on("exit", () => {
    if (sharedHost !== host) return;
    sharedHost = null;
    const previous = [...scopes.values()];
    scopes.clear();
    for (const scope of previous) scope.exit();
  });
  return host;
}
// Process/transport ownership only. It cannot grant trust or persist business receipts.
export class HostConnection {
  private scopeId: string | null = null;
  private readonly closeListeners = new Set<() => void>();
  constructor(
    private readonly receive: (
      message: Exclude<HostMessage, { kind: "ready" }>,
    ) => void,
    private readonly exited: () => void,
  ) {}
  get connected(): boolean {
    return this.scopeId !== null;
  }
  start(command: HostStart, ready: (message: Ready) => void): Promise<void> {
    if (this.scopeId) return Promise.reject(Error("Host already connected"));
    const host = hostProcess();
    this.scopeId = command.processInstanceId;
    return new Promise((accept, reject) => {
      const timeout = setTimeout(() => {
        reject(Error("Host startup timeout"));
        host.postMessage({
          scopeId: command.processInstanceId,
          command: { kind: "close-idle" },
        });
      }, 35000);
      const exit = () => {
        clearTimeout(timeout);
        if (this.scopeId !== command.processInstanceId) return;
        scopes.delete(command.processInstanceId);
        this.scopeId = null;
        this.exited();
        for (const listener of this.closeListeners) listener();
        reject(Error("Host exited"));
      };
      scopes.set(command.processInstanceId, {
        exit,
        message: (message) => {
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
            if (message.kind === "failed" || message.kind === "interrupted") {
              clearTimeout(timeout);
              reject(Error("Host unavailable"));
            }
          }
        },
      });
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
    if (!this.connected) return;
    await new Promise<void>((accept, reject) => {
      const done = () => {
        clearTimeout(timer);
        this.closeListeners.delete(done);
        accept();
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

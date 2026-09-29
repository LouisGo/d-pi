import { join } from "node:path";
import { type UtilityProcess, utilityProcess } from "electron";
import {
  type HostCommand,
  type HostMessage,
  HostMessageSchema,
  type HostStart,
} from "../contracts/public";

type ReadyMessage = Extract<HostMessage, { kind: "ready" }>;
type Ready = ReadyMessage & {
  state: ReadyMessage["state"] & { sessionFile: string };
};
// Process/transport ownership only. It cannot grant trust or persist business receipts.
export class HostConnection {
  private process: UtilityProcess | null = null;
  constructor(
    private readonly receive: (
      message: Exclude<HostMessage, { kind: "ready" }>,
    ) => void,
    private readonly exited: () => void,
  ) {}
  get connected(): boolean {
    return this.process !== null;
  }
  start(command: HostStart, ready: (message: Ready) => void): Promise<void> {
    if (this.process) return Promise.reject(Error("Host already connected"));
    const host = utilityProcess.fork(
      join(import.meta.dirname, "session-host.js"),
      [],
      { serviceName: "d-pi SessionHost" },
    );
    this.process = host;
    return new Promise((accept, reject) => {
      const timeout = setTimeout(() => {
        reject(Error("Host startup timeout"));
        host.kill();
      }, 35000);
      host.on("exit", () => {
        clearTimeout(timeout);
        if (this.process !== host) return;
        this.process = null;
        this.exited();
        reject(Error("Host exited"));
      });
      host.on("message", (raw: unknown) => {
        if (this.process !== host) return;
        const parsed = HostMessageSchema.safeParse(raw);
        if (!parsed.success) return;
        const message = parsed.data;
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
      });
      host.postMessage(command);
    });
  }
  send(command: HostCommand): void {
    if (!this.process) throw Error("Host unavailable");
    this.process.postMessage(command);
  }
  attach(port: Electron.MessagePortMain): void {
    if (!this.process) {
      port.close();
      return;
    }
    this.process.postMessage({ kind: "attach" }, [port]);
  }
  async closeIdle(): Promise<void> {
    const host = this.process;
    if (!host) return;
    await new Promise<void>((accept, reject) => {
      const done = () => {
        clearTimeout(timer);
        accept();
      };
      const timer = setTimeout(() => {
        host.removeListener("exit", done);
        reject(Error("Idle close not confirmed"));
      }, 5000);
      host.once("exit", done);
      host.postMessage({ kind: "close-idle" });
    });
  }
}

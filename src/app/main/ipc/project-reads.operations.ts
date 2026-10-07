import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";
import {
  ReadCancelledError,
  type ReadIdentity,
  ReadOperationError,
  type ReadResponse,
} from "../../../shared/read-operation";

type ReadOwner = { senderId: number; frame: string };
function readOwner(event: IpcMainEvent | IpcMainInvokeEvent): ReadOwner {
  return {
    senderId: event.sender.id,
    frame: `${event.senderFrame?.processId}:${event.senderFrame?.routingId}`,
  };
}
/** A connection's read operations, not OMP work; cancelled waits retain resources until finalization. */
export class ProjectReadOperations {
  private readonly operations = new Map<
    string,
    {
      owner: ReadOwner;
      identity: ReadIdentity;
      controller: AbortController;
      completion: Promise<unknown>;
    }
  >();
  private closed = false;
  private closing: Promise<void> | undefined;
  constructor(
    private readonly limits = {
      maxOperations: 32,
      maxPerSender: 16,
      timeoutMs: 30_000,
    },
  ) {}
  get size() {
    return this.operations.size;
  }
  run<T>(
    event: IpcMainEvent | IpcMainInvokeEvent,
    identity: ReadIdentity,
    sample: (signal: AbortSignal) => Promise<T>,
  ): Promise<ReadResponse<T>> {
    identity = { operationId: identity.operationId, traceId: identity.traceId };
    const owner = readOwner(event);
    const key = `${owner.senderId}:${owner.frame}:${identity.operationId}`;
    const failed = (
      code: ReadOperationError["code"],
      retryable = false,
    ): ReadResponse<T> => ({
      kind: "failed",
      error: {
        ...identity,
        code:
          code === "invalid-reply" || code === "transport-unavailable"
            ? "io"
            : code,
        retryable,
        attribution: code === "failed" ? "unknown" : "main",
      },
    });
    if (this.closed) return Promise.resolve(failed("owner-released"));
    if (this.operations.has(key))
      return Promise.resolve(failed("duplicate-operation"));
    let held = 0;
    for (const entry of this.operations.values())
      if (entry.owner.senderId === owner.senderId) held++;
    if (
      this.operations.size >= this.limits.maxOperations ||
      held >= this.limits.maxPerSender
    )
      return Promise.resolve(failed("busy"));
    const controller = new AbortController();
    let resolve: (value: ReadResponse<T>) => void = () => {};
    const completion = new Promise<ReadResponse<T>>((accept) => {
      resolve = accept;
    });
    this.operations.set(key, { owner, identity, controller, completion });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.limits.timeoutMs);
    timer.unref();
    void (async () => {
      let response: ReadResponse<T>;
      try {
        const reply = await sample(controller.signal);
        response = controller.signal.aborted
          ? timedOut
            ? failed("timeout", true)
            : { kind: "cancelled", ...identity }
          : { kind: "completed", ...identity, reply };
      } catch (error) {
        response = timedOut
          ? failed("timeout", true)
          : error instanceof ReadCancelledError || controller.signal.aborted
            ? { kind: "cancelled", ...identity }
            : error instanceof ReadOperationError
              ? failed(error.code, error.retryable)
              : failed("failed");
      } finally {
        clearTimeout(timer);
        this.operations.delete(key);
      }
      resolve(response);
    })();
    return completion;
  }
  cancel(
    event: IpcMainEvent | IpcMainInvokeEvent,
    identity: ReadIdentity,
  ): void {
    const owner = readOwner(event);
    const entry = this.operations.get(
      `${owner.senderId}:${owner.frame}:${identity.operationId}`,
    );
    if (entry?.identity.traceId === identity.traceId) entry.controller.abort();
  }
  releaseSender(senderId: number): void {
    for (const entry of this.operations.values())
      if (entry.owner.senderId === senderId) entry.controller.abort();
  }
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    for (const entry of this.operations.values()) entry.controller.abort();
    this.closing = Promise.allSettled(
      [...this.operations.values()].map((entry) => entry.completion),
    ).then(() => {});
    return this.closing;
  }
}

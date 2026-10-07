import { match } from "ts-pattern";
import { z } from "zod";
import { TraceIdSchema } from "./identity";

export const ReadIdentitySchema = z.strictObject({
  operationId: z.uuid(),
  traceId: TraceIdSchema,
});
export type ReadIdentity = z.infer<typeof ReadIdentitySchema>;
export const ReadFailureCodeSchema = z.enum([
  "failed",
  "timeout",
  "io",
  "process-spawn",
  "process-exit",
  "output-read",
  "malformed-output",
  "busy",
  "foreign-thread",
  "invalid-source",
  "duplicate-operation",
  "owner-released",
]);
export const ReadFailureSchema = ReadIdentitySchema.extend({
  code: ReadFailureCodeSchema,
  retryable: z.boolean(),
  attribution: z.enum(["main", "unknown"]),
});
export type ReadFailure = z.infer<typeof ReadFailureSchema>;
export const ReadCancellationSchema = ReadIdentitySchema;
export const ReadCancelReplySchema = ReadIdentitySchema.extend({
  kind: z.literal("acknowledged"),
});
export type ReadCancelReply = z.infer<typeof ReadCancelReplySchema>;
export function readResponseSchema<T extends z.ZodType>(reply: T) {
  return z.discriminatedUnion("kind", [
    ReadIdentitySchema.extend({ kind: z.literal("completed"), reply }),
    ReadIdentitySchema.extend({ kind: z.literal("cancelled") }),
    z.strictObject({ kind: z.literal("failed"), error: ReadFailureSchema }),
  ]);
}
export type ReadResponse<T> =
  | (ReadIdentity & { kind: "completed"; reply: T })
  | (ReadIdentity & { kind: "cancelled" })
  | { kind: "failed"; error: ReadFailure };

/** Stable sampling failure; raw platform errors remain private causes. */
export class ReadOperationError extends Error {
  constructor(
    readonly code:
      | ReadFailure["code"]
      | "invalid-reply"
      | "transport-unavailable",
    readonly retryable = false,
    options?: ErrorOptions,
    readonly failure?: ReadFailure,
  ) {
    super(`Read operation: ${code}`, options);
    this.name = "ReadOperationError";
  }
}
/** Local cancellation port; never serialized through contextBridge. */
export interface ReadAbortSignal {
  readonly aborted: boolean;
  addEventListener(
    type: "abort",
    listener: () => void,
    options?: { once: boolean },
  ): void;
  removeEventListener(type: "abort", listener: () => void): void;
}
export class ReadCancelledError extends Error {
  constructor() {
    super("Read operation cancelled");
    this.name = "AbortError";
  }
}
export function throwIfReadCancelled(signal?: ReadAbortSignal): void {
  if (signal?.aborted) throw new ReadCancelledError();
}
export function readRetry(failures: number, error: Error): boolean {
  return (
    failures < 3 &&
    "code" in error &&
    (error.code === "timeout" ||
      error.code === "io" ||
      error.code === "output-read" ||
      error.code === "process-exit") &&
    "retryable" in error &&
    error.retryable === true
  );
}

/** AbortSignal stays in the calling world; only identity DTOs cross the bridge. */
export async function requestReadOperation<T>(
  bridge: {
    request: () => Promise<ReadResponse<T>>;
    cancel: (identity: ReadIdentity) => Promise<ReadCancelReply>;
  },
  identity: ReadIdentity,
  signal?: ReadAbortSignal,
): Promise<T> {
  identity = { operationId: identity.operationId, traceId: identity.traceId };
  throwIfReadCancelled(signal);
  const pending = bridge.request();
  let abort: (() => void) | undefined;
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      void bridge.cancel(identity).catch(() => {});
      reject(new ReadCancelledError());
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
  try {
    const response = await Promise.race([pending, cancelled]);
    return match(response)
      .with({ kind: "completed" }, ({ reply }) => reply)
      .with({ kind: "cancelled" }, () => {
        throw new ReadCancelledError();
      })
      .with({ kind: "failed" }, ({ error }) => {
        throw new ReadOperationError(
          error.code,
          error.retryable,
          undefined,
          error,
        );
      })
      .exhaustive();
  } finally {
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

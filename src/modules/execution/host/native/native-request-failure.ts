import { z } from "zod";
import {
  type NativeFailureOperation,
  NativeFailureOperationSchema,
  type NativeFailureSummary,
} from "../../contracts/native-failure";

export class NativeRequestFailure extends Error {
  constructor(
    readonly failure: NativeFailureSummary,
    message: string,
  ) {
    super(message);
    this.name = "NativeRequestFailure";
  }
}

export function nativeOperation(value: string) {
  const parsed = NativeFailureOperationSchema.safeParse(value);
  return parsed.success ? parsed.data : "unknown";
}

export function nativeFailureOf(
  error: unknown,
): NativeFailureSummary | undefined {
  return error instanceof NativeRequestFailure ? error.failure : undefined;
}

// Failed decoding carries no native payload, parse detail, or raw cause across
// the Host boundary. The operation is supplied by the trusted caller.
export function nativeData<T>(
  schema: z.ZodType<T>,
  response: Record<string, unknown>,
  operation: NativeFailureOperation,
): T {
  const parsed = schema.safeParse(response.data);
  if (parsed.success) return parsed.data;
  const requestId = z.uuid().safeParse(response.id);
  throw new NativeRequestFailure(
    {
      kind: "protocol",
      operation,
      ...(requestId.success ? { requestId: requestId.data } : {}),
    },
    "Native response data is invalid",
  );
}

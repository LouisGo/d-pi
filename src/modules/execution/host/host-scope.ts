import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";

export interface ScopedDeadline {
  cancel(): void;
}

// Promise/callback facade for one Host's Effect scope. Execution facts and
// physical native-process release remain with their existing owners.
export class HostScope {
  private readonly scope = Scope.makeUnsafe("parallel");
  private closing: Promise<void> | null = null;
  private closed = false;
  constructor(private readonly onFailure: (error: unknown) => void) {}

  async run<A>(operation: (signal: AbortSignal) => Promise<A>): Promise<A> {
    if (this.closed) throw Error("Host wait interrupted");
    const fiber = Effect.runSync(
      Effect.forkIn(
        Effect.tryPromise({ try: operation, catch: (error) => error }),
        this.scope,
        { startImmediately: true },
      ),
    );
    const result = await Effect.runPromiseExit(Fiber.join(fiber));
    if (Exit.isSuccess(result)) return result.value;
    if (result.cause.reasons.every(Cause.isInterruptReason))
      throw Error("Host wait interrupted");
    throw Cause.squash(result.cause);
  }

  deadline(
    delay: number,
    operation: () => void | Promise<void>,
    unref = false,
  ): ScopedDeadline {
    if (this.closed) return { cancel() {} };
    // Effect 4.0.0's live Clock does not unref timers. This callback adapter
    // preserves the existing Node liveness contract and scoped cancellation.
    const wait = Effect.callback<void>((resume) => {
      const timer = setTimeout(() => resume(Effect.void), delay);
      if (unref) timer.unref();
      return Effect.sync(() => clearTimeout(timer));
    });
    let fiber: Fiber.Fiber<void, unknown> | null = Effect.runSync(
      Effect.forkIn(
        wait.pipe(
          Effect.andThen(
            Effect.tryPromise({
              try: async () => {
                if (!this.closed) await operation();
              },
              catch: (error) => error,
            }),
          ),
        ),
        this.scope,
        { startImmediately: true },
      ),
    );
    void Effect.runPromiseExit(Fiber.join(fiber)).then((result) => {
      fiber = null;
      if (
        Exit.isFailure(result) &&
        !result.cause.reasons.every(Cause.isInterruptReason)
      )
        this.onFailure(Cause.squash(result.cause));
    });
    return {
      cancel: () => {
        if (fiber) void Effect.runPromise(Fiber.interrupt(fiber));
      },
    };
  }

  close(): Promise<void> {
    this.closed = true;
    this.closing ??= Effect.runPromise(Scope.close(this.scope, Exit.void));
    return this.closing;
  }
}

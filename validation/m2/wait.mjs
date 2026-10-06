import { AsyncLocalStorage } from "node:async_hooks";

export class ValidationTransportError extends Error {}

const waitRequests = new AsyncLocalStorage();

/** A CDP request opts into cancellation by its current validation wait. */
export function registerWaitCancellation(cancel) {
  const requests = waitRequests.getStore();
  requests?.add(cancel);
  return () => requests?.delete(cancel);
}

export async function wait(
  fn,
  timeout = 30000,
  label = "M2 package condition",
) {
  if (!Number.isFinite(timeout) || timeout < 0)
    throw new TypeError(
      "Validation wait requires a finite nonnegative timeout",
    );
  const until = performance.now() + timeout;
  let lastObservation = "not evaluated";
  let lastError;
  const requests = new Set();
  const timeoutError = () => {
    const detail =
      lastError instanceof Error
        ? `${lastError.name}: ${lastError.message}`.slice(0, 200)
        : lastError === undefined
          ? "none"
          : `thrown ${typeof lastError}`;
    return Object.assign(
      Error(
        `M2 package timeout [${label.slice(0, 160)}]: last=${lastObservation}; last error=${detail}`,
      ),
      { code: "VALIDATION_WAIT_TIMEOUT" },
    );
  };
  const cancelOutstanding = (reason = "timeout") => {
    let failure = timeoutError();
    for (const cancel of [...requests]) failure = cancel(reason) ?? failure;
    return failure;
  };
  try {
    while (performance.now() < until) {
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => waitRequests.run(requests, fn)),
          new Promise((_, reject) => {
            timer = setTimeout(
              timeoutErrorAndReject,
              until - performance.now(),
            );
            function timeoutErrorAndReject() {
              reject(cancelOutstanding());
            }
          }),
        ]);
        if (value) return value;
        lastObservation = String(value);
      } catch (error) {
        if (
          error instanceof ValidationTransportError ||
          error?.code === "VALIDATION_WAIT_TIMEOUT"
        )
          throw error;
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
      const remaining = until - performance.now();
      if (remaining > 0)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(50, remaining)),
        );
    }
    throw cancelOutstanding();
  } finally {
    cancelOutstanding("cancelled");
  }
}

export function waitForEnabledAction(evaluate, waitFor, selector, label) {
  return waitFor(
    () =>
      evaluate(
        `document.querySelector(${JSON.stringify(selector)})?.disabled === false`,
      ),
    30000,
    label,
  );
}

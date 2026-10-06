import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import {
  ValidationTransportError,
  wait,
  waitForEnabledAction,
} from "../../validation/m2/wait.mjs";

test("a failed package condition reports its phase and bounded last predicate error", async () => {
  await assert.rejects(
    wait(
      () => {
        throw Error(`fixture predicate ${"x".repeat(1000)}`);
      },
      10,
      "diagnostics initial sampling",
    ),
    (error) => {
      assert.match(error.message, /diagnostics initial sampling/);
      assert.match(error.message, /fixture predicate/);
      assert.ok(error.message.length < 600);
      return true;
    },
  );
});

test("an action must exist and finish its pending state before the next operation", async () => {
  const states = [null, { disabled: true }, { disabled: false }];
  let observed;
  const evaluate = (expression) =>
    runInNewContext(expression, {
      document: {
        querySelector() {
          observed = states.shift();
          return observed;
        },
      },
    });
  await waitForEnabledAction(
    evaluate,
    (fn, _timeout, label) => wait(fn, 500, label),
    "[data-fixture-action]",
    "queue save completed",
  );
  assert.deepEqual(observed, { disabled: false });
  assert.equal(states.length, 0);
});

test("a closed or timed-out transport is propagated instead of retried as a UI condition", async () => {
  for (const message of ["CDP closed", "CDP Runtime.evaluate timeout"]) {
    const failure = new ValidationTransportError(message);
    let attempts = 0;
    await assert.rejects(
      wait(
        () => {
          attempts++;
          throw failure;
        },
        20,
        "diagnostic refresh",
      ),
      (error) => error === failure,
    );
    assert.equal(attempts, 1);
  }
});

test("a stalled predicate still has a bounded wait deadline", async () => {
  const started = performance.now();
  await assert.rejects(
    wait(() => new Promise(() => {}), 20, "stalled frame"),
    /stalled frame.*last=not evaluated/,
  );
  assert.ok(performance.now() - started < 500);
});

test("a missing or busy action reports its phase without requiring browser frames", async () => {
  for (const action of [null, { disabled: true }]) {
    await assert.rejects(
      waitForEnabledAction(
        (expression) =>
          runInNewContext(expression, {
            document: { querySelector: () => action },
          }),
        (fn, _timeout, label) => wait(fn, 15, label),
        "[data-fixture-action]",
        "diagnostics initial sampling",
      ),
      /diagnostics initial sampling.*last=false/,
    );
  }
});

test("transient predicate errors can recover and successful values are preserved", async () => {
  const expected = { id: "fixture-result" };
  let attempts = 0;
  const result = await wait(() => {
    if (++attempts === 1) throw Error("transient fixture state");
    return expected;
  }, 500);
  assert.equal(result, expected);
});

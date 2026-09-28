import { expect, it } from "vitest";
import { ConsumptionGate } from "./consumption-gate";

it("keeps native consumption blocked until every independent reason is released", async () => {
  const gate = new ConsumptionGate();
  gate.pause("user-stop");
  gate.pause("editing");
  let consumed = false;
  const pending = gate.wait().then(() => {
    consumed = true;
  });
  await Promise.resolve();
  expect(consumed).toBe(false);
  gate.resume("editing");
  await Promise.resolve();
  expect(consumed).toBe(false);
  gate.resume("user-stop");
  await pending;
  expect(consumed).toBe(true);
});

it("an aborted native attempt is released without releasing the user stop for the next attempt", async () => {
  const gate = new ConsumptionGate();
  gate.pause("user-stop");
  const controller = new AbortController();
  let ended = false;
  const attempt = gate.wait(controller.signal).catch(() => {
    ended = true;
  });
  controller.abort();
  await Promise.resolve();
  await Promise.resolve();
  expect(ended).toBe(true);
  await attempt;
  let consumed = false;
  const next = gate.wait().then(() => {
    consumed = true;
  });
  await Promise.resolve();
  expect(consumed).toBe(false);
  gate.resume("user-stop");
  await next;
});

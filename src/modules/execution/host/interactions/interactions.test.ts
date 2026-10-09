import { expect, it } from "vitest";
import { PendingInteractions } from "./interactions";

it("writes custom select text unchanged once, using the existing value response", () => {
  const interactions = new PendingInteractions();
  interactions.update({
    type: "extension_ui_request",
    method: "select",
    id: "custom",
    title: "Pick or write",
    options: ["A", "B"],
  });
  const frames: string[] = [];
  const value = "  我自己的回答\n保留原始文本  ";
  try {
    expect(
      interactions.answer("custom", { kind: "value", value }, (frame) =>
        frames.push(frame),
      ),
    ).toBe(true);
    expect(frames.map((frame) => JSON.parse(frame))).toEqual([
      { type: "extension_ui_response", id: "custom", value },
    ]);
    expect(
      interactions.answer(
        "custom",
        { kind: "value", value: "second" },
        (frame) => frames.push(frame),
      ),
    ).toBe(false);
    expect(frames).toHaveLength(1);
  } finally {
    interactions.dispose();
  }
});

it("still rejects text for confirm and confirmation booleans for select", () => {
  const interactions = new PendingInteractions();
  const write = () => {
    throw Error("must not write an incompatible response");
  };
  try {
    interactions.update({
      type: "extension_ui_request",
      method: "confirm",
      id: "confirm",
      title: "Confirm",
    });
    interactions.update({
      type: "extension_ui_request",
      method: "select",
      id: "select",
      title: "Select",
      options: ["A"],
    });
    expect(
      interactions.answer(
        "confirm",
        { kind: "value", value: "approve" },
        write,
      ),
    ).toBe(false);
    expect(
      interactions.answer(
        "select",
        { kind: "confirm", confirmed: true },
        write,
      ),
    ).toBe(false);
  } finally {
    interactions.dispose();
  }
});

it("does not classify an unknown host frame as an interaction", () => {
  const interaction = new PendingInteractions();

  interaction.update({
    type: "host_future_request",
    id: "future",
    payload: { value: "forward-compatible" },
  });

  expect(interaction.pending).toBe(false);
  expect(interaction.snapshot()).toEqual([]);
});

it("native status notifications do not block idle close; real dialogs stay pending until their own cancellation", () => {
  const interaction = new PendingInteractions();
  interaction.update({
    type: "extension_ui_request",
    method: "setStatus",
    id: "status",
  });
  expect(interaction.pending).toBe(false);
  interaction.update({
    type: "extension_ui_request",
    method: "confirm",
    id: "dialog",
  });
  expect(interaction.pending).toBe(true);
  interaction.update({
    type: "extension_ui_request",
    method: "cancel",
    targetId: "other",
  });
  expect(interaction.pending).toBe(true);
  interaction.update({
    type: "extension_ui_request",
    method: "cancel",
    targetId: "dialog",
  });
  expect(interaction.pending).toBe(false);
});

it("preserves all native dialog fields for reconnecting views without answering", () => {
  const interaction = new PendingInteractions();
  interaction.update({
    type: "extension_ui_request",
    method: "confirm",
    id: "confirm-1",
    title: "是否继续",
    message: "执行此操作？",
  });
  expect(interaction.snapshot()).toMatchObject([
    {
      id: "confirm-1",
      method: "confirm",
      title: "是否继续",
      message: "执行此操作？",
      status: "pending",
    },
  ]);
});

it("writes an answer only once and refuses responses after native cancellation", () => {
  const interaction = new PendingInteractions();
  const frames: string[] = [];
  interaction.update({
    type: "extension_ui_request",
    method: "confirm",
    id: "a",
    title: "Confirm",
    message: "Sure?",
  });
  const answer = interaction.answer.bind(interaction);
  expect(
    answer("a", { kind: "confirm", confirmed: false }, (frame: string) =>
      frames.push(frame),
    ),
  ).toBe(true);
  expect(
    answer("a", { kind: "confirm", confirmed: true }, (frame: string) =>
      frames.push(frame),
    ),
  ).toBe(false);
  expect(frames.map((f) => JSON.parse(f))).toEqual([
    { type: "extension_ui_response", id: "a", confirmed: false },
  ]);
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "b",
    title: "Input",
  });
  interaction.update({
    type: "extension_ui_request",
    method: "cancel",
    targetId: "b",
  });
  expect(
    answer("b", { kind: "value", value: "late" }, (frame: string) =>
      frames.push(frame),
    ),
  ).toBe(false);
  expect(frames).toHaveLength(1);
});

it("expires native timed dialogs and never retries a response after a write failure", () => {
  const interaction = new PendingInteractions();
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "expired",
    title: "Input",
    timeout: 0,
  });
  const frames: string[] = [];
  expect(
    interaction.answer("expired", { kind: "value", value: "late" }, (f) =>
      frames.push(f),
    ),
  ).toBe(false);
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "failed",
    title: "Input",
  });
  expect(
    interaction.answer("failed", { kind: "value", value: "answer" }, () => {
      throw Error("closed");
    }),
  ).toBe(false);
  expect(
    interaction.answer("failed", { kind: "value", value: "answer" }, (f) =>
      frames.push(f),
    ),
  ).toBe(false);
  expect(frames).toHaveLength(0);
});

it("releases the pending answer marker after a write failure while keeping the dialog unknown", () => {
  const interaction = new PendingInteractions();
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "write-failed",
    title: "Input",
  });
  expect(interaction.pending).toBe(true);
  expect(
    interaction.answer(
      "write-failed",
      { kind: "value", value: "answer" },
      () => {
        throw Error("closed");
      },
    ),
  ).toBe(false);
  expect(interaction.pending).toBe(false);
  expect(interaction.snapshot()).toMatchObject([
    { id: "write-failed", status: "unknown" },
  ]);
  const frames: string[] = [];
  expect(
    interaction.answer(
      "write-failed",
      { kind: "value", value: "answer" },
      (f) => frames.push(f),
    ),
  ).toBe(false);
  expect(frames).toHaveLength(0);
});

it("marks host-cancelled dialogs cancelled instead of leaving them pending", () => {
  let changed = 0;
  const interaction = new PendingInteractions(() => {
    changed++;
  });
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "host-cancelled",
    title: "Input",
  });
  expect(interaction.pending).toBe(true);
  interaction.update({ type: "host_tool_cancel", id: "host-cancelled" });
  expect(interaction.snapshot()).toMatchObject([
    { id: "host-cancelled", status: "cancelled" },
  ]);
  expect(interaction.pending).toBe(false);
  expect(changed).toBeGreaterThan(0);
  const frames: string[] = [];
  expect(
    interaction.answer(
      "host-cancelled",
      { kind: "value", value: "late" },
      (f: string) => frames.push(f),
    ),
  ).toBe(false);
  expect(frames).toHaveLength(0);
});

it("dismisses unknown dialogs locally to release the submit block", () => {
  let changed = 0;
  const interaction = new PendingInteractions(() => {
    changed++;
  });
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "stuck",
    title: "Details",
  });
  expect(
    interaction.answer("stuck", { kind: "value", value: "a" }, () => {
      throw Error("closed");
    }),
  ).toBe(false);
  expect(
    interaction.snapshot().find((item) => item.id === "stuck"),
  ).toMatchObject({ status: "unknown" });
  expect(interaction.dismiss("stuck")).toBe(true);
  expect(changed).toBeGreaterThan(0);
  expect(
    interaction.snapshot().find((item) => item.id === "stuck"),
  ).toMatchObject({ status: "cancelled", dismissed: true });
  expect(interaction.pending).toBe(false);
  expect(interaction.dismiss("stuck")).toBe(false);
  expect(interaction.dismiss("missing")).toBe(false);
});

it("writes the timeout default atomically without an intermediate sent snapshot", () => {
  let changed = 0;
  const interaction = new PendingInteractions(() => {
    changed++;
  });
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "atomic",
    title: "Details",
    prefill: "draft",
  });
  const frames: string[] = [];
  expect(
    interaction.answerDefault(
      "atomic",
      { kind: "value", value: "draft" },
      (f) => frames.push(f),
    ),
  ).toBe(true);
  // No changed() inside the mutation; caller publishes once.
  expect(changed).toBe(0);
  expect(interaction.snapshot()).toMatchObject([
    { id: "atomic", status: "sent", defaultAnswered: true },
  ]);
  expect(frames.map((f) => JSON.parse(f))).toEqual([
    { type: "extension_ui_response", id: "atomic", value: "draft" },
  ]);
  // Failure leaves unknown without the flag and releases pending.
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "atomic-fail",
    title: "Details",
  });
  expect(
    interaction.answerDefault(
      "atomic-fail",
      { kind: "value", value: "x" },
      () => {
        throw Error("closed");
      },
    ),
  ).toBe(false);
  expect(
    interaction.snapshot().find((item) => item.id === "atomic-fail"),
  ).toMatchObject({ id: "atomic-fail", status: "unknown" });
  expect(
    interaction.snapshot().find((item) => item.id === "atomic-fail")
      ?.defaultAnswered,
  ).toBeUndefined();
});

it("converges pending markers on disconnect while keeping interrupted dialogs unknown", () => {
  const interaction = new PendingInteractions();
  interaction.update({
    type: "extension_ui_request",
    method: "confirm",
    id: "disconnected",
    title: "Confirm",
  });
  expect(interaction.pending).toBe(true);
  interaction.disconnect();
  expect(interaction.pending).toBe(false);
  expect(interaction.snapshot()).toMatchObject([
    { id: "disconnected", status: "unknown" },
  ]);
});

it("clears the native expiry timer on answer so no second publish fires", () => {
  let changed = 0;
  const interaction = new PendingInteractions(() => {
    changed++;
  });
  interaction.update({
    type: "extension_ui_request",
    method: "input",
    id: "timed",
    title: "Details",
    timeout: 50,
  });
  const frames: string[] = [];
  expect(
    interaction.answer("timed", { kind: "value", value: "v" }, (f) =>
      frames.push(f),
    ),
  ).toBe(true);
  const afterAnswer = changed;
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      // Timer was cleared: no extra changed() after the natural expiry point.
      expect(changed).toBe(afterAnswer);
      expect(
        interaction.snapshot().find((item) => item.id === "timed"),
      ).toMatchObject({ status: "sent" });
      resolve();
    }, 80);
  });
});

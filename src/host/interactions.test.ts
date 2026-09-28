import { expect, it } from "vitest";
import { PendingInteractions } from "./interactions";

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

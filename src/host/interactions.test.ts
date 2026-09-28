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

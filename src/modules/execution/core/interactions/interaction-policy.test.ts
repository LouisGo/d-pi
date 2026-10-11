import { expect, it } from "vitest";
import { InteractionSchema } from "../../contracts/interactions";
import { interactionPolicy } from "./interaction-policy";

it("declares the original ordinary defaults and fixed observation deadline", () => {
  const dialog = InteractionSchema.parse({
    id: "A",
    title: "Q",
    method: "select",
    options: ["first", "second"],
    expiresAt: null,
    status: "pending",
  });
  expect(interactionPolicy(dialog, 10, false)).toEqual({
    defaultOwner: "app",
    expiry: 120010,
    defaultResult: { kind: "value", value: "first" },
    reason: "legacy-default",
  });
  expect(
    interactionPolicy({ ...dialog, expiresAt: 5000 }, 10, false).expiry,
  ).toBe(4000);
  expect(interactionPolicy(dialog, 10, true)).toEqual({
    defaultOwner: "manual",
    expiry: null,
    reason: "approval-unassociated",
  });
});
it("never inherits ordinary App defaults for rich ask or confirmation", () => {
  const ask = InteractionSchema.parse({
    id: "A",
    method: "ask",
    questions: [{ id: "one", question: "Q", options: [] }],
    expiresAt: null,
    status: "pending",
  });
  expect(interactionPolicy(ask, 10, true)).toEqual({
    defaultOwner: "native",
    expiry: null,
    reason: "native-ask",
  });
  expect(
    interactionPolicy(
      InteractionSchema.parse({
        id: "C",
        title: "Q",
        method: "confirm",
        expiresAt: null,
        status: "pending",
      }),
      10,
      false,
    ).defaultOwner,
  ).toBe("manual");
});

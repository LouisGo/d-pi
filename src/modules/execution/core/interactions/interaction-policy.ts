import {
  defaultAnswerFor,
  type Interaction,
  type InteractionPolicy,
} from "../../contracts/interactions";

/** The Host supplies the first observation time; repeated publication never
 * restarts an App deadline. Native rich ask owns its own defaults. */
export function interactionPolicy(
  dialog: Interaction,
  observedAt: number,
  approvalGuarded: boolean,
): InteractionPolicy {
  if (approvalGuarded && dialog.method === "select")
    return {
      defaultOwner: "manual",
      expiry: null,
      reason: "approval-unassociated",
    };
  if (dialog.method === "ask")
    return {
      defaultOwner: "native",
      expiry: dialog.expiresAt,
      reason: "native-ask",
    };
  const result = defaultAnswerFor(dialog);
  if (!result)
    return {
      defaultOwner: "manual",
      expiry: dialog.expiresAt,
      reason: "confirmation",
    };
  return {
    defaultOwner: "app",
    expiry:
      dialog.expiresAt === null
        ? observedAt + 120_000
        : dialog.expiresAt - 1_000,
    defaultResult: result,
    reason: "legacy-default",
  };
}

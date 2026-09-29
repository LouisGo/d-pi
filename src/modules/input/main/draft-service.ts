import type { Draft, DraftReader } from "../contracts/public";

export type DraftSaveRequest = {
  threadId: Draft["threadId"];
  expectedRevision: number;
  text: string;
};

export type DraftSaveResult =
  | { kind: "saved"; threadId: Draft["threadId"]; revision: number }
  | { kind: "identity-mismatch" }
  | { kind: "revision-conflict" };

/**
 * Save only the input-owned revision. Command decoding, UI errors, and
 * workspace selection belong to the app composition layer.
 */
export function saveDraft(
  drafts: Pick<DraftReader, "active" | "save">,
  request: DraftSaveRequest,
): DraftSaveResult {
  if (drafts.active()?.threadId !== request.threadId)
    return { kind: "identity-mismatch" };
  const revision = drafts.save(
    request.threadId,
    request.expectedRevision,
    request.text,
  );
  return revision === null
    ? { kind: "revision-conflict" }
    : { kind: "saved", threadId: request.threadId, revision };
}

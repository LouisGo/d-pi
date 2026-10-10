import type { HistoryEntry } from "../../../modules/conversation/contracts/public";
import type { SubmissionReceipt } from "../../../modules/execution/contracts/public";
import { readDraftAttachmentTokens } from "../../../modules/input/core/public";
import type { NativeSessionBinding } from "../../../modules/threads/contracts/public";

/** Presentation equivalence only; never infers a receipt/native identity or execution outcome. */
export function presentSavedInput(
  entry: HistoryEntry,
  binding: NativeSessionBinding,
  receipts: readonly SubmissionReceipt[],
): HistoryEntry {
  if (entry.role !== "user") return entry;
  const candidates = receipts.filter(
    (receipt) =>
      receipt.threadId === binding.threadId &&
      receipt.target.nativeSessionRef === binding.sessionFile &&
      receipt.target.configContextId === binding.configContextId &&
      receipt.content?.message === entry.text &&
      receipt.content.images.length === (entry.images?.length ?? 0) &&
      // OMP normalizes image MIME/bytes for the model before saving history.
      // This projection establishes text/file presentation equivalence, never
      // image identity: images and their verified digests remain native-owned.
      receipt.content.sources
        .filter((source) => source.representation === "image")
        .every(
          (source, index) =>
            source.name.slice(0, 512) === entry.images?.[index]?.name,
        ),
  );
  const presentations = candidates.flatMap((receipt) => {
    const tokens = readDraftAttachmentTokens(receipt.text);
    if (!tokens.ok || !receipt.content || !tokens.tokens.length) return [];
    let displayText = receipt.text;
    for (const token of tokens.tokens) {
      if (
        !receipt.content.sources.some(
          (source) => source.attachmentId === token.id,
        )
      )
        return [];
      displayText = displayText.replace(token.token, "");
    }
    const fileSources = receipt.content.sources.filter(
      (source) => source.representation !== "image",
    );
    const envelopesComplete =
      [...entry.text.matchAll(/\n\[\/attachment\](?=\n)/g)].length ===
      fileSources.length;
    const files = fileSources.map((source) => {
      const name = source.path ?? source.name;
      const headers = [
        `\n[${name}]\n`,
        `\n[${name}; directory listing]\n`,
        `\n[${name}; PDF text]\n`,
        `\n[${name}; PDF text; explicit text-only]\n`,
      ];
      const matching = headers.filter((header) => entry.text.includes(header));
      const header = matching.length === 1 ? matching[0] : undefined;
      const at = header ? entry.text.indexOf(header) : -1;
      const start = at >= 0 && header ? at + header.length : undefined;
      const end =
        start === undefined
          ? -1
          : entry.text.indexOf("\n[/attachment]\n", start);
      // Repeated/embedded envelopes remain explicit unavailable previews.
      const unique =
        header && entry.text.indexOf(header, at + header.length) < 0;
      return {
        contextKind:
          source.path || source.frozenReference
            ? ("project" as const)
            : ("external" as const),
        ...(source.referenceKind
          ? { referenceKind: source.referenceKind }
          : {}),
        name: source.name,
        byteLength: source.byteLength,
        ...(envelopesComplete && unique && start !== undefined && end >= start
          ? { start, end }
          : {}),
      };
    });
    const inputParts: NonNullable<HistoryEntry["inputParts"]> = [];
    let position = 0;
    for (const token of tokens.tokens) {
      if (token.position > position)
        inputParts.push({
          kind: "text",
          text: receipt.text.slice(position, token.position),
        });
      const index = fileSources.findIndex(
        (source) => source.attachmentId === token.id,
      );
      if (index >= 0) inputParts.push({ kind: "file", index });
      position = token.position + token.token.length;
    }
    if (position < receipt.text.length)
      inputParts.push({ kind: "text", text: receipt.text.slice(position) });
    return [{ displayText: displayText.trim(), files, inputParts }];
  });
  const presentation = presentations[0];
  if (
    !presentation ||
    presentations.length !== candidates.length ||
    presentations.some(
      (value) => JSON.stringify(value) !== JSON.stringify(presentation),
    )
  )
    return entry;
  return { ...entry, ...presentation };
}

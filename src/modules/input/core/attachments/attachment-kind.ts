import type { Attachment } from "../../contracts/public";

/** External images are independent of the editable document and its history. */
export function isDetachedImage(item: Attachment): boolean {
  return (
    item.source !== "reference" &&
    !item.frozenReference &&
    (item.mimeType.toLowerCase().startsWith("image/") ||
      item.representation === "image")
  );
}

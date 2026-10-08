import type { Attachment } from "../../contracts/public";
import type { DraftController } from "../../core/draft-controller";
import { attachmentIds } from "./attachment-reference";

export function isDetachedImage(item: Attachment): boolean {
  return item.source !== "reference" && !item.frozenReference &&
    (item.mimeType.toLowerCase().startsWith("image/") || item.representation === "image");
}
function identity(item: Attachment): string {
  if (item.source === "reference")
    return JSON.stringify(["reference", item.threadId, item.path, item.referenceKind]);
  if (item.frozenReference)
    return JSON.stringify(["frozen", item.frozenReference, item.inputDigest]);
  // T3 uses name/MIME/size. Add Main's verified digest so a changed file with
  // the same name and size cannot silently collapse into the previous version.
  return item.inputDigest
    ? JSON.stringify(["asset", item.name, item.mimeType.toLowerCase(), item.byteLength, item.inputDigest])
    : `id:${item.id}`;
}
/** View-independent metadata lookup; selection and the draft remain elsewhere. */
export class AttachmentAdoption {
  private readonly items = new Map<string, Attachment>();
  constructor(readonly controller: DraftController) {}
  register(items: readonly Attachment[]): void {
    for (const item of items)
      if (item.threadId === this.controller.threadId) this.items.set(item.id, item);
    const active = new Set(attachmentIds(this.controller.getTextSnapshot()));
    this.controller.registerDetachedAttachments(items.filter((item) => active.has(item.id) && isDetachedImage(item)).map((item) => item.id));
  }
  admit(incoming: readonly Attachment[]): Attachment[] {
    this.register(incoming);
    const active = new Set(attachmentIds(this.controller.getTextSnapshot()));
    const keys = new Set([...active].flatMap((id) => {
      const item = this.items.get(id); return item ? [identity(item)] : [];
    }));
    return incoming.filter((item) => {
      if (item.threadId !== this.controller.threadId || active.has(item.id) || keys.has(identity(item))) return false;
      active.add(item.id); keys.add(identity(item)); return true;
    });
  }
}

export const DRAFT_MAX_BYTES = 4 * 1024 * 1024;
export const draftByteLength = (text: string): number =>
  new TextEncoder().encode(text).byteLength;

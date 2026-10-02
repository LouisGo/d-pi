export const ATTACHMENT_TOKEN_PREFIX = "[[dpi-attachment:";
export function attachmentToken(id: string): string {
  return `${ATTACHMENT_TOKEN_PREFIX}${id}]]`;
}
export function readAttachmentTokens(
  text: string,
):
  | { ok: true; tokens: { id: string; token: string; position: number }[] }
  | { ok: false } {
  const tokens: { id: string; token: string; position: number }[] = [];
  let cursor = 0;
  for (;;) {
    const position = text.indexOf(ATTACHMENT_TOKEN_PREFIX, cursor);
    if (position < 0) return { ok: true, tokens };
    const end = text.indexOf("]]", position);
    if (end < 0) return { ok: false };
    const id = text.slice(position + ATTACHMENT_TOKEN_PREFIX.length, end);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id,
      )
    )
      return { ok: false };
    const token = text.slice(position, end + 2);
    tokens.push({ id, token, position });
    cursor = end + 2;
  }
}

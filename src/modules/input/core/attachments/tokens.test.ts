import { expect, it } from "vitest";
import { serializeReference } from "../references/serialize";
import { attachmentToken, readDraftAttachmentTokens } from "./tokens";

it("keeps absolute offsets around frozen Unicode source and skips its token-looking literals", () => {
  const id = crypto.randomUUID(),
    token = attachmentToken(id);
  const source = `中文${token} [[dpi-attachment:broken]]`;
  const frozen = serializeReference({
    kind: "selection",
    path: "中文.ts",
    source: "working-tree",
    version: "v1",
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: source.length + 1,
    text: source,
  });
  const body = `before${token}\n${frozen}\n后${token}`;
  expect(readDraftAttachmentTokens(body)).toEqual({
    ok: true,
    tokens: [
      { id, token, position: body.indexOf(token) },
      { id, token, position: body.lastIndexOf(token) },
    ],
  });
  expect(readDraftAttachmentTokens(frozen)).toEqual({ ok: true, tokens: [] });
});
it("still rejects malformed authority in ordinary paragraphs beside valid frozen source", () => {
  const frozen = serializeReference({
    kind: "selection",
    path: "source.txt",
    source: "working-tree",
    version: "v1",
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 2,
    text: "x",
  });
  expect(
    readDraftAttachmentTokens(`${frozen}\n[[dpi-attachment:broken]]`),
  ).toEqual({ ok: false });
});

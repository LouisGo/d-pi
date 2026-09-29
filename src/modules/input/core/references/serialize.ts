import { z } from "zod";
import type { FrozenSelection } from "../../../files/core/public";

type Selection = Extract<FrozenSelection, { kind: "selection" }>;
export type DraftBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "selection"; value: Selection };
const PREFIX = "[d-pi:file-selection:v1 ";
const SUFFIX = "\n[/d-pi:file-selection]";
const ReferenceHeaderSchema = z.strictObject({
  schemaVersion: z.literal(1),
  path: z.string().max(4096),
  source: z.string().max(8192),
  version: z.string().max(256),
  startLine: z.number().int().positive(),
  startColumn: z.number().int().positive(),
  endLine: z.number().int().positive(),
  endColumn: z.number().int().positive(),
  textLength: z.number().int().positive().max(65536),
});

export function serializeReference(value: Selection): string {
  const {
    path,
    source,
    version,
    startLine,
    startColumn,
    endLine,
    endColumn,
    text,
  } = value;
  const header = {
    schemaVersion: 1,
    path,
    source,
    version,
    startLine,
    startColumn,
    endLine,
    endColumn,
    textLength: text.length,
  };
  return `${PREFIX}${JSON.stringify(header)}]\n${text}${SUFFIX}`;
}

function readReference(
  body: string,
  position: number,
  lineEnd: number,
): { value: Selection; next: number } | null {
  const headerLine = body.slice(position, lineEnd);
  if (!headerLine.startsWith(PREFIX) || !headerLine.endsWith("]")) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(headerLine.slice(PREFIX.length, -1));
  } catch {
    return null;
  }
  const parsed = ReferenceHeaderSchema.safeParse(raw);
  if (!parsed.success) return null;
  const contentStart = lineEnd + 1;
  const contentEnd = contentStart + parsed.data.textLength;
  if (contentEnd > body.length || !body.startsWith(SUFFIX, contentEnd))
    return null;
  const next = contentEnd + SUFFIX.length;
  if (next < body.length && body[next] !== "\n") return null;
  const text = body.slice(contentStart, contentEnd);
  if (new TextEncoder().encode(text).length > 64 * 1024) return null;
  const {
    schemaVersion: _schemaVersion,
    textLength: _textLength,
    ...fields
  } = parsed.data;
  return { value: { kind: "selection", ...fields, text }, next };
}

export function parseDraftBlocks(body: string): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  let position = 0;
  while (position <= body.length) {
    const lineEnd = body.indexOf("\n", position);
    if (lineEnd < 0) {
      blocks.push({ kind: "paragraph", text: body.slice(position) });
      break;
    }
    const reference = readReference(body, position, lineEnd);
    if (reference) {
      blocks.push({ kind: "selection", value: reference.value });
      if (reference.next === body.length) break;
      position = reference.next + 1;
      if (position === body.length) {
        blocks.push({ kind: "paragraph", text: "" });
        break;
      }
      continue;
    }
    blocks.push({ kind: "paragraph", text: body.slice(position, lineEnd) });
    position = lineEnd + 1;
  }
  return blocks;
}

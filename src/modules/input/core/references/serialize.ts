import { z } from "zod";
import { utf8ByteLength } from "../../../../shared/text/utf8";
import type { FrozenSelection } from "../../../files/core/public";

import {
  type FrozenContext,
  FrozenContextSchema,
} from "../../../resources/contracts/public";

type Selection = Extract<FrozenSelection, { kind: "selection" }>;
export type DraftBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "selection"; value: Selection }
  | { kind: "context"; value: FrozenContext };
const CONTEXT_PREFIX = "[d-pi:context:v1 ";
const CONTEXT_SUFFIX = "\n[/d-pi:context]";
export function serializeFrozenContext(raw: FrozenContext): string {
  const { text, ...value } = FrozenContextSchema.parse(raw);
  return `${CONTEXT_PREFIX}${JSON.stringify({ ...value, textLength: text.length })}]\n${text}${CONTEXT_SUFFIX}`;
}
export function serializeDraftBlock(block: DraftBlock): string {
  if (block.kind === "paragraph") return block.text;
  return block.kind === "context"
    ? serializeFrozenContext(block.value)
    : serializeReference(block.value);
}
function readContext(
  body: string,
  position: number,
  lineEnd: number,
): { value: FrozenContext; next: number } | null {
  const line = body.slice(position, lineEnd);
  if (!line.startsWith(CONTEXT_PREFIX) || !line.endsWith("]")) return null;
  try {
    const raw: unknown = JSON.parse(line.slice(CONTEXT_PREFIX.length, -1));
    const header = z
      .strictObject({
        source: FrozenContextSchema.shape.source,
        contentRevision: FrozenContextSchema.shape.contentRevision,
        title: FrozenContextSchema.shape.title,
        coverage: FrozenContextSchema.shape.coverage,
        range: FrozenContextSchema.shape.range,
        textLength: z.number().int().positive().max(65536),
      })
      .parse(raw);
    const start = lineEnd + 1,
      end = start + header.textLength;
    if (!body.startsWith(CONTEXT_SUFFIX, end)) return null;
    const next = end + CONTEXT_SUFFIX.length;
    if (next < body.length && body[next] !== "\n") return null;
    const { textLength: _length, ...fields } = header;
    return {
      value: FrozenContextSchema.parse({
        ...fields,
        text: body.slice(start, end),
      }),
      next,
    };
  } catch {
    return null;
  }
}
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
  if (utf8ByteLength(text) > 64 * 1024) return null;
  const {
    schemaVersion: _schemaVersion,
    textLength: _textLength,
    ...fields
  } = parsed.data;
  return { value: { kind: "selection", ...fields, text }, next };
}

export function parseDraftBlocks(
  body: string,
  visit?: (block: DraftBlock, position: number) => void,
): DraftBlock[] {
  const blocks: DraftBlock[] = [];
  const append = (block: DraftBlock, position: number) => {
    blocks.push(block);
    visit?.(block, position);
  };
  let position = 0;
  while (position <= body.length) {
    const lineEnd = body.indexOf("\n", position);
    if (lineEnd < 0) {
      append({ kind: "paragraph", text: body.slice(position) }, position);
      break;
    }
    const context = readContext(body, position, lineEnd);
    if (context) {
      append({ kind: "context", value: context.value }, position);
      if (context.next === body.length) break;
      position = context.next + 1;
      continue;
    }
    const reference = readReference(body, position, lineEnd);
    if (reference) {
      append({ kind: "selection", value: reference.value }, position);
      if (reference.next === body.length) break;
      position = reference.next + 1;
      if (position === body.length) {
        append({ kind: "paragraph", text: "" }, position);
        break;
      }
      continue;
    }
    append(
      { kind: "paragraph", text: body.slice(position, lineEnd) },
      position,
    );
    position = lineEnd + 1;
  }
  return blocks;
}

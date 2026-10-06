export const READING_SEGMENT_CHARACTERS = 8192;
export const READING_SEGMENT_LINES = 120;

export interface ReadingSegment {
  readonly start: number;
  readonly end: number;
}

/** Offsets into the existing projection, never a second copy of its full text. */
export function readingSegments(text: string): readonly ReadingSegment[] {
  const segments: ReadingSegment[] = [];
  for (let start = 0; start < text.length; ) {
    let end = Math.min(start + READING_SEGMENT_CHARACTERS, text.length);
    let lines = 1;
    for (let index = start; index < end; index++) {
      if (
        text[index] === "\r" ||
        text[index] === "\n" ||
        text[index] === "\u2028" ||
        text[index] === "\u2029"
      ) {
        if (++lines > READING_SEGMENT_LINES) {
          end = index;
          break;
        }
        if (text[index] === "\r" && text[index + 1] === "\n") index++;
      }
    }
    // Splits do not introduce lone surrogates or split one CRLF line ending.
    if (end < text.length) {
      const previous = text.charCodeAt(end - 1);
      const next = text.charCodeAt(end);
      if (
        (previous >= 0xd800 &&
          previous <= 0xdbff &&
          next >= 0xdc00 &&
          next <= 0xdfff) ||
        (text[end - 1] === "\r" && text[end] === "\n")
      )
        end--;
    }
    segments.push({ start, end });
    start = end;
  }
  return segments;
}

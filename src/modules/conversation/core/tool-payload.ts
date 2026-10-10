import type { ToolPayload } from "../contracts/tool-observation";

export type ToolPayloadByteCounter = (text: string) => number;

export function projectToolPayload(
  input: unknown,
  byteLength: ToolPayloadByteCounter,
): ToolPayload {
  let remaining = 8192;
  let nodes = 128;
  let truncated = false;
  const visit = (value: unknown, depth: number): ToolPayload["value"] => {
    if (--nodes < 0 || depth > 5 || remaining < 32) {
      truncated = true;
      remaining -= 4;
      return null;
    }
    if (value === null || typeof value === "boolean") {
      remaining -= 5;
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      remaining -= 32;
      return value;
    }
    if (typeof value === "string") {
      const limit = Math.min(1024, Math.floor((remaining - 2) / 6));
      const text = value.slice(0, limit);
      truncated ||= text.length !== value.length;
      remaining -= byteLength(JSON.stringify(text));
      return text;
    }
    if (Array.isArray(value)) {
      const result: ToolPayload["value"][] = [];
      remaining -= 2;
      for (let i = 0; i < value.length; i++) {
        if (i >= 32 || remaining < 16 || nodes <= 0) {
          truncated = true;
          break;
        }
        remaining--;
        result.push(visit(value[i], depth + 1));
      }
      return result;
    }
    if (typeof value === "object" && value !== null) {
      const result: Record<string, ToolPayload["value"]> = {};
      remaining -= 2;
      let count = 0;
      for (const key in value) {
        if (!Object.hasOwn(value, key)) continue;
        // Binary image payloads are not a text/structured tool detail.
        if (key === "data" && "type" in value && value.type === "image") {
          truncated = true;
          continue;
        }
        const cost = byteLength(JSON.stringify(key)) + 2;
        if (
          ++count > 32 ||
          key.length > 120 ||
          remaining - cost < 16 ||
          nodes <= 0
        ) {
          truncated = true;
          break;
        }
        remaining -= cost;
        Object.defineProperty(result, key, {
          value: visit(Reflect.get(value, key), depth + 1),
          enumerable: true,
        });
      }
      return result;
    }
    truncated = true;
    remaining -= 4;
    return null;
  };
  return { value: visit(input, 0), truncated };
}

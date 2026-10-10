import { describe, expect, it } from "vitest";
import { projectToolPayload } from "./tool-payload";

describe("projectToolPayload", () => {
  const measureBytes = (text: string): number => Buffer.byteLength(text);
  it("preserves bounded JSON payloads and primitives", () => {
    const input = {
      str: "hello",
      num: 42,
      bool: true,
      nil: null,
      arr: [1, 2, 3],
      nested: { a: "b" },
    };
    const projected = projectToolPayload(input, measureBytes);
    expect(projected).toEqual({
      value: input,
      truncated: false,
    });
  });

  it("excludes binary image data and marks truncated", () => {
    const input = {
      content: [
        { type: "text", text: "description" },
        {
          type: "image",
          mimeType: "image/png",
          data: "base64imagebyteswhichshouldbeexcluded",
        },
      ],
    };
    const projected = projectToolPayload(input, measureBytes);
    expect(projected.truncated).toBe(true);
    expect(projected.value).toEqual({
      content: [
        { type: "text", text: "description" },
        { type: "image", mimeType: "image/png" },
      ],
    });
  });

  it("truncates long strings to 1024 chars", () => {
    const long = "A".repeat(2000);
    const projected = projectToolPayload({ long }, measureBytes);
    expect(projected.truncated).toBe(true);
    if (
      projected.value !== null &&
      typeof projected.value === "object" &&
      "long" in projected.value &&
      typeof projected.value.long === "string"
    ) {
      expect(projected.value.long.length).toBe(1024);
    } else {
      expect.unreachable("expected object with long string property");
    }
  });
  it("truncates array elements beyond 32", () => {
    const arr = Array.from({ length: 50 }, (_, i) => i);
    const projected = projectToolPayload(arr, measureBytes);
    expect(projected.truncated).toBe(true);
    if (Array.isArray(projected.value)) {
      expect(projected.value.length).toBe(32);
    } else {
      expect.unreachable("expected array value");
    }
  });

  it("truncates object keys beyond 32", () => {
    const obj: Record<string, number> = {};
    for (let i = 0; i < 50; i++) {
      obj[`key_${i}`] = i;
    }
    const projected = projectToolPayload(obj, measureBytes);
    expect(projected.truncated).toBe(true);
    if (
      projected.value !== null &&
      typeof projected.value === "object" &&
      !Array.isArray(projected.value)
    ) {
      expect(Object.keys(projected.value).length).toBe(32);
    } else {
      expect.unreachable("expected object value");
    }
  });
  it("caps nested depth at 5", () => {
    const deep = {
      l1: {
        l2: {
          l3: {
            l4: {
              l5: {
                l6: "too deep",
              },
            },
          },
        },
      },
    };
    const projected = projectToolPayload(deep, measureBytes);
    expect(projected.truncated).toBe(true);
  });
});

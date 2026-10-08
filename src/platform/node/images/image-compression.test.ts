import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { expect, it } from "vitest";
import { createImageCompressor } from "./image-compression";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(name: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(name), data]),
    output = Buffer.alloc(data.length + 12);
  output.writeUInt32BE(data.length);
  body.copy(output, 4);
  output.writeUInt32BE(crc32(body), output.length - 4);
  return output;
}
function png(width: number, height: number) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  let seed = 42;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width * 4; x++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      raw[y * (width * 4 + 1) + 1 + x] = seed >>> 24;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const compress = createImageCompressor(async () => ({
  binary: fileURLToPath(
    new URL("../../../../resources/sdk/bun", import.meta.url),
  ),
  entry: fileURLToPath(
    new URL("../../../../runtime/host.mjs", import.meta.url),
  ),
}));
it("keeps valid within-budget bytes verbatim, without an encoded return payload", async () => {
  const bytes = png(12, 8);
  const result = await compress(bytes, "image/png");
  expect(result).toMatchObject({
    ok: true,
    recompressed: false,
    width: 12,
    height: 8,
    mimeType: "image/png",
  });
  if (result.ok) expect(result.bytes).toBe(bytes);
});
it("compresses a high-entropy transparent image within the byte cap and exposes dimensions", async () => {
  const bytes = png(256, 256);
  const result = await compress(bytes, "image/png", {
    maxBytes: 16000,
    maxDimension: 128,
  });
  expect(result).toMatchObject({
    ok: true,
    recompressed: true,
    originalWidth: 256,
    originalHeight: 256,
  });
  if (!result.ok) throw Error(result.reason);
  expect(result.bytes.length).toBeLessThanOrEqual(16000);
  expect(result.width).toBeLessThanOrEqual(128);
  expect(result.height).toBe(result.width);
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  if (result.mimeType === "image/webp") expect(result.bytes[20]! & 16).toBe(16); // VP8X alpha flag.
});
it("handles an actual image above the production 10 MiB threshold with default policy", async () => {
  const bytes = png(2560, 1280);
  expect(bytes.length).toBeGreaterThan(10 * 1024 * 1024);
  const result = await compress(bytes, "image/png");
  expect(result).toMatchObject({
    ok: true,
    recompressed: true,
    originalWidth: 2560,
    originalHeight: 1280,
    width: 2048,
    height: 1024,
    mimeType: "image/png",
  });
  if (!result.ok) throw Error(result.reason);
  expect(result.bytes.length).toBeLessThanOrEqual(10 * 1024 * 1024);
});
it("rejects malformed content and pixel bombs before an unbounded decode", async () => {
  expect(
    await compress(Buffer.from("not an image"), "image/png"),
  ).toMatchObject({ ok: false });
  expect(
    await compress(png(64, 64), "image/png", { maxPixels: 100 }),
  ).toMatchObject({ ok: false, reason: "image-too-many-pixels" });
  expect(
    await compress(Buffer.alloc(101), "image/png", { maxSourceBytes: 100 }),
  ).toEqual({ ok: false, reason: "source-too-large" });
});
it("does not turn an oversized GIF into its first frame", async () => {
  const gif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    "base64",
  );
  expect(await compress(gif, "image/gif", { maxBytes: 10 })).toEqual({
    ok: false,
    reason: "image-compression-unsupported",
  });
});
it("bounds queued binary memory and releases the slot only after the child closes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "dpi-image-queue-"));
  try {
    const entry = join(directory, "image-compression.mjs");
    writeFileSync(
      entry,
      `const chunks=[];for await(const c of process.stdin)chunks.push(c);setTimeout(()=>{console.log(JSON.stringify({ok:true,mimeType:'image/png',byteLength:Buffer.concat(chunks).length,width:1,height:1,originalWidth:1,originalHeight:1,recompressed:false}));},80);`,
    );
    const fixture = createImageCompressor(async () => ({
      binary: process.execPath,
      entry: join(directory, "host.mjs"),
    }));
    const jobs = Array.from({ length: 9 }, () =>
      fixture(Buffer.alloc(10), "image/png"),
    );
    const results = await Promise.all(jobs);
    expect(results.filter((r) => r.ok)).toHaveLength(8);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, reason: "image-compression-busy" },
    ]);
    expect(await fixture(Buffer.alloc(10), "image/png")).toMatchObject({
      ok: true,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("supports thumbnail callers without upscaling or distorting the source", async () => {
  const result = await compress(png(256, 128), "image/png", {
    forceResize: true,
    maxDimension: 100,
    maxBytes: 100000,
  });
  expect(result).toMatchObject({
    ok: true,
    recompressed: true,
    width: 100,
    height: 50,
    originalWidth: 256,
    originalHeight: 128,
  });
  const small = await compress(png(8, 4), "image/png", {
    forceResize: true,
    maxDimension: 100,
  });
  expect(small).toMatchObject({ ok: true, width: 8, height: 4 });
});

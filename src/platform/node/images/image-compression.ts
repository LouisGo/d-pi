import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { z } from "zod";
import { IMAGE_COMPRESSION_DEFAULTS } from "../../../shared/image-policy";

export const ImageCompressionOptionsSchema = z.strictObject({
  maxBytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  maxSourceBytes: z
    .number()
    .int()
    .positive()
    .max(25 * 1024 * 1024),
  maxPixels: z
    .number()
    .int()
    .positive()
    .max(64 * 1024 * 1024),
  maxDimension: z.number().int().positive().max(8192),
  forceResize: z.boolean(),
});
export type ImageCompressionOptions = z.infer<
  typeof ImageCompressionOptionsSchema
>;
const MimeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const FailureSchema = z.enum([
  "source-too-large",
  "invalid-image",
  "image-too-large",
  "image-too-many-pixels",
  "image-compression-unsupported",
  "image-compression-failed",
  "image-compression-unavailable",
  "image-compression-busy",
]);
const ResultSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(false), reason: FailureSchema }),
  z.strictObject({
    ok: z.literal(true),
    mimeType: MimeSchema,
    byteLength: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    originalWidth: z.number().int().positive(),
    originalHeight: z.number().int().positive(),
    recompressed: z.boolean(),
  }),
]);
export type ImageCompressionResult =
  | { ok: false; reason: z.infer<typeof FailureSchema> }
  | {
      ok: true;
      bytes: Uint8Array;
      mimeType: z.infer<typeof MimeSchema>;
      width: number;
      height: number;
      originalWidth: number;
      originalHeight: number;
      recompressed: boolean;
    };
/** A reusable bounded owner. Callers keep original bytes; no Electron or domain state. */
export function createImageCompressor(
  runtime: () => Promise<{ binary: string; entry: string }>,
) {
  let active = 0,
    reservedBytes = 0;
  const queue: Array<() => void> = [];
  let resources: Promise<{ binary: string; entry: string }> | undefined;
  async function run(
    bytes: Uint8Array,
    mimeType: z.infer<typeof MimeSchema>,
    options: ImageCompressionOptions,
  ): Promise<ImageCompressionResult> {
    try {
      resources ??= runtime();
      const sdk = await resources;
      return await new Promise<ImageCompressionResult>((resolve) => {
        const child = spawn(
          sdk.binary,
          [
            join(dirname(sdk.entry), "image-compression.mjs"),
            JSON.stringify({ ...options, mimeType }),
          ],
          {
            cwd: dirname(sdk.entry),
            stdio: ["pipe", "pipe", "ignore"],
            env: { PATH: process.env.PATH },
          },
        );
        const chunks: Buffer[] = [];
        let size = 0,
          done = false;
        let result: ImageCompressionResult | undefined;
        const fail = (reason: z.infer<typeof FailureSchema>) => {
          result = { ok: false, reason };
          child.kill("SIGKILL");
        };
        const timer = setTimeout(() => fail("image-compression-failed"), 20000);
        child.on("error", () => {
          result = { ok: false, reason: "image-compression-unavailable" };
        });
        child.stdin.on("error", () => fail("image-compression-failed"));
        child.stdout.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes + 4096) fail("image-compression-failed");
          else if (!result) chunks.push(chunk);
        });
        child.once("close", (code) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (result) {
            resolve(result);
            return;
          }
          if (code !== 0) {
            resolve({ ok: false, reason: "image-compression-failed" });
            return;
          }
          try {
            const output = Buffer.concat(chunks, size),
              newline = output.indexOf(10);
            if (newline < 0 || newline > 4096) throw Error("invalid-frame");
            const value = ResultSchema.parse(
              JSON.parse(output.subarray(0, newline).toString("utf8")),
            );
            if (!value.ok) {
              resolve(value);
              return;
            }
            const encoded = output.subarray(newline + 1);
            if (
              value.byteLength > options.maxBytes ||
              value.width * value.height > options.maxPixels ||
              (value.recompressed
                ? encoded.length !== value.byteLength
                : encoded.length !== 0 ||
                  value.byteLength !== bytes.length ||
                  value.mimeType !== mimeType)
            )
              throw Error("invalid-result");
            const { byteLength: _length, ...metadata } = value;
            resolve({
              ...metadata,
              bytes: value.recompressed ? encoded : bytes,
            });
          } catch {
            resolve({ ok: false, reason: "image-compression-failed" });
          }
        });
        child.stdin.end(bytes);
      });
    } catch {
      resources = undefined;
      return { ok: false, reason: "image-compression-unavailable" };
    }
  }
  return async function compressImage(
    bytes: Uint8Array,
    mimeType: z.infer<typeof MimeSchema>,
    options: Partial<ImageCompressionOptions> = {},
  ): Promise<ImageCompressionResult> {
    const policy = ImageCompressionOptionsSchema.parse({
      ...IMAGE_COMPRESSION_DEFAULTS,
      ...options,
    });
    if (bytes.length > policy.maxSourceBytes)
      return { ok: false, reason: "source-too-large" };
    if (!bytes.length) return { ok: false, reason: "invalid-image" };
    if (queue.length >= 6 || reservedBytes + bytes.length > 100 * 1024 * 1024)
      return { ok: false, reason: "image-compression-busy" };
    reservedBytes += bytes.length;
    if (active >= 2) await new Promise<void>((resolve) => queue.push(resolve));
    else active++;
    try {
      return await run(bytes, mimeType, policy);
    } finally {
      reservedBytes -= bytes.length;
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}

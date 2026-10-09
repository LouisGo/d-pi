import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, realpath, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { HistoryImageReply } from "../contracts/history";

const BlobReferenceSchema = z.string().regex(/^blob:sha256:[a-f0-9]{64}$/);
export const NativeImagePartSchema = z.object({
  type: z.literal("image"),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
  data: z.union([
    BlobReferenceSchema,
    z
      .string()
      .min(1)
      .max(44739244)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  ]),
});
type NativeImagePart = z.infer<typeof NativeImagePartSchema>;

export function nativeImageDigest(image: NativeImagePart): string {
  return BlobReferenceSchema.safeParse(image.data).success
    ? image.data.slice("blob:sha256:".length)
    : createHash("sha256")
        .update(Buffer.from(image.data, "base64"))
        .digest("hex");
}

/** OMP 18.4.6 BlobStore uses <getBlobsDir()>/<sha256>; never a renderer path. */
export async function readNativeImagePart(
  image: NativeImagePart,
  blobsDirectory?: string,
): Promise<HistoryImageReply> {
  if (!BlobReferenceSchema.safeParse(image.data).success)
    return {
      kind: "image",
      dataUrl: `data:${image.mimeType};base64,${image.data}`,
    };
  if (!blobsDirectory) return { kind: "unavailable", reason: "missing" };
  const digest = nativeImageDigest(image);
  try {
    const root = await realpath(blobsDirectory);
    const path = join(root, digest);
    const file = await open(
      path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const before = await file.stat();
      if (!before.isFile()) return { kind: "unavailable", reason: "denied" };
      if (before.size < 1 || before.size > 32 * 1024 * 1024)
        return { kind: "unavailable", reason: "unsupported" };
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const read = await file.read(
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        if (!read.bytesRead) return { kind: "unavailable", reason: "changed" };
        offset += read.bytesRead;
      }
      const [after, current] = await Promise.all([file.stat(), stat(path)]);
      if (
        before.dev !== current.dev ||
        before.ino !== current.ino ||
        before.size !== after.size ||
        before.mtimeMs !== after.mtimeMs ||
        before.ctimeMs !== after.ctimeMs ||
        (await realpath(blobsDirectory)) !== root ||
        createHash("sha256").update(bytes).digest("hex") !== digest
      )
        return { kind: "unavailable", reason: "changed" };
      return {
        kind: "image",
        dataUrl: `data:${image.mimeType};base64,${bytes.toString("base64")}`,
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    const code = z.object({ code: z.string() }).safeParse(error);
    if (code.success && code.data.code === "ENOENT")
      return { kind: "unavailable", reason: "missing" };
    if (code.success && ["EACCES", "EPERM", "ELOOP"].includes(code.data.code))
      return { kind: "unavailable", reason: "denied" };
    return { kind: "unavailable", reason: "invalid" };
  }
}

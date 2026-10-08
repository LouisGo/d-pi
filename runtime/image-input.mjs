import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { join } from "node:path";

const MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
function matchesMime(bytes, mime) {
  if (mime === "image/png")
    return bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/gif")
    return ["GIF87a", "GIF89a"].includes(
      bytes.subarray(0, 6).toString("ascii"),
    );
  return (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  );
}
/** Resolve only App-created immutable private objects, never a caller-supplied path. */
export async function hydrateImageResources(frame, directory, policy) {
  if (
    !Array.isArray(frame.images) ||
    !frame.images.some((image) => image && "resource" in image)
  )
    return frame;
  if (!policy || frame.images.length > 128) throw Error("transport-too-large");
  let total = 0;
  for (const image of frame.images) {
    if (!image || image.type !== "image" || !MIME.has(image.mimeType))
      throw Error("content-corrupt");
    if ("resource" in image) {
      const r = image.resource;
      if (
        !r ||
        typeof r.digest !== "string" ||
        !/^[a-f0-9]{64}$/.test(r.digest) ||
        !Number.isSafeInteger(r.byteLength) ||
        r.byteLength <= 0 ||
        "data" in image ||
        Object.keys(r).length !== 2
      )
        throw Error("content-corrupt");
      if (r.byteLength > policy.imageBytes) throw Error("transport-too-large");
      total += r.byteLength;
    } else if (typeof image.data === "string")
      total += Math.ceil((image.data.length * 3) / 4);
    else throw Error("content-corrupt");
  }
  if (total > policy.totalImageBytes) throw Error("transport-too-large");
  if (!directory) throw Error("content-missing");
  const objects = join(directory, "objects");
  try {
    if (
      !(await lstat(directory)).isDirectory() ||
      (await realpath(directory)) !== directory ||
      !(await lstat(objects)).isDirectory() ||
      (await realpath(objects)) !== objects
    )
      throw Error("content-corrupt");
  } catch (error) {
    if (error.code === "ENOENT") throw Error("content-missing");
    throw Error("content-corrupt");
  }
  const images = [];
  for (const image of frame.images) {
    if (!("resource" in image)) {
      images.push(image);
      continue;
    }
    let handle;
    try {
      handle = await open(
        join(objects, image.resource.digest),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      const before = await handle.stat();
      if (!before.isFile() || before.size !== image.resource.byteLength)
        throw Error("content-corrupt");
      // Bounded read, even if the file grows after stat; never readFile an unchecked object.
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const { bytesRead } = await handle.read(
          bytes,
          offset,
          bytes.length - offset,
          offset,
        );
        if (!bytesRead) throw Error("content-corrupt");
        offset += bytesRead;
      }
      const after = await handle.stat();
      if (
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs ||
        createHash("sha256").update(bytes).digest("hex") !==
          image.resource.digest ||
        !matchesMime(bytes, image.mimeType)
      )
        throw Error("content-corrupt");
      images.push({
        type: "image",
        mimeType: image.mimeType,
        data: bytes.toString("base64"),
      });
    } catch (error) {
      throw Error(
        error.code === "ENOENT" ? "content-missing" : "content-corrupt",
      );
    } finally {
      await handle?.close();
    }
  }
  const result = { ...frame, images };
  const metadata = {
    ...result,
    images: images.map((image) => ({ ...image, data: "" })),
  };
  const encodedBytes =
    Buffer.byteLength(JSON.stringify(metadata)) +
    1 +
    images.reduce(
      (sum, image, index) =>
        sum +
        ("resource" in frame.images[index]
          ? image.data.length
          : Buffer.byteLength(JSON.stringify(image.data)) - 2),
      0,
    );
  if (encodedBytes > policy.encodedBytes) throw Error("transport-too-large");
  return result;
}

/** Admission is rechecked after asynchronous file reads, before the SDK receives bytes. */
export async function prepareImageInput(
  frame,
  directory,
  policy,
  canForward,
  hydrate = hydrateImageResources,
) {
  if (!canForward()) return { kind: "rejected", reason: "paused" };
  try {
    const prepared = await hydrate(frame, directory, policy);
    return canForward()
      ? { kind: "forward", frame: prepared }
      : { kind: "rejected", reason: "paused" };
  } catch (error) {
    return {
      kind: "rejected",
      reason: [
        "content-missing",
        "content-corrupt",
        "transport-too-large",
      ].includes(error.message)
        ? error.message
        : "content-corrupt",
    };
  }
}

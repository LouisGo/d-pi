/** Binary worker: metadata JSON line followed by encoded bytes. No Base64 IPC. */
const options = JSON.parse(process.argv[2]);
for (const key of ["maxBytes", "maxSourceBytes", "maxPixels", "maxDimension"]) {
  if (!Number.isSafeInteger(options[key]) || options[key] <= 0)
    throw Error("invalid-policy");
}
const chunks = [];
let size = 0;
for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > options.maxSourceBytes) throw Error("source-too-large");
  chunks.push(chunk);
}
const input = Buffer.concat(chunks, size);
function animated(format, bytes) {
  if (format === "gif") return true; // Bun decodes the first frame; never silently flatten a GIF.
  if (format === "webp")
    return (
      bytes.subarray(12, 16).toString("ascii") === "VP8X" &&
      Boolean(bytes[20] & 2)
    );
  if (format === "png") {
    for (let offset = 8; offset + 12 <= bytes.length; ) {
      const length = bytes.readUInt32BE(offset);
      if (bytes.subarray(offset + 4, offset + 8).toString("ascii") === "acTL")
        return true;
      offset += 12 + length;
    }
  }
  return false;
}
async function compress() {
  const image = new Bun.Image(input, {
    maxPixels: options.maxPixels,
    autoOrient: true,
  });
  const {
    width: originalWidth,
    height: originalHeight,
    format,
  } = await image.metadata();
  const mimeType = `image/${format}`;
  if (
    !new Set(["png", "jpeg", "webp", "gif"]).has(format) ||
    mimeType !== options.mimeType
  )
    throw Error("invalid-image");
  if (!options.forceResize && input.length <= options.maxBytes) {
    // Validate pixels off Main's JS thread; return the exact source bytes to the caller.
    await image.resize(1, 1).png().bytes();
    return {
      ok: true,
      mimeType,
      originalWidth,
      originalHeight,
      width: originalWidth,
      height: originalHeight,
      recompressed: false,
    };
  }
  if (animated(format, input)) throw Error("image-compression-unsupported");
  // Decode the large source once; native fit preserves aspect and EXIF orientation.
  // Retry encoders only see this bounded lossless image.
  const resized = await image
    .resize(options.maxDimension, options.maxDimension, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .bytes();
  const { width, height } = await new Bun.Image(resized, {
    maxPixels: options.maxPixels,
  }).metadata();
  if (resized.length <= options.maxBytes)
    return {
      ok: true,
      mimeType: "image/png",
      originalWidth,
      originalHeight,
      width,
      height,
      recompressed: true,
      bytes: resized,
    };
  for (const dimensionScale of [1, 0.75, 0.5]) {
    const w = Math.max(1, Math.round(width * dimensionScale)),
      h = Math.max(1, Math.round(height * dimensionScale));
    for (const quality of [90, 80, 65, 50]) {
      // WebP preserves alpha. Never flatten transparent screenshots into JPEG.
      const bytes = await new Bun.Image(resized, {
        maxPixels: options.maxPixels,
      })
        .resize(w, h)
        .webp({ quality })
        .bytes();
      if (bytes.length <= options.maxBytes)
        return {
          ok: true,
          mimeType: "image/webp",
          originalWidth,
          originalHeight,
          width: w,
          height: h,
          recompressed: true,
          bytes,
        };
    }
  }
  throw Error("image-too-large");
}
try {
  const { bytes, ...result } = await compress();
  process.stdout.write(
    `${JSON.stringify({ ...result, byteLength: bytes?.length ?? input.length })}\n`,
  );
  if (bytes) process.stdout.write(bytes);
} catch (error) {
  const reason =
    error.code === "ERR_IMAGE_TOO_MANY_PIXELS"
      ? "image-too-many-pixels"
      : new Set([
            "invalid-image",
            "image-compression-unsupported",
            "image-too-large",
          ]).has(error.message)
        ? error.message
        : "image-compression-failed";
  process.stdout.write(`${JSON.stringify({ ok: false, reason })}\n`);
}

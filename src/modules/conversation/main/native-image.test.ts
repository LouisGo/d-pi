import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { NativeImagePartSchema, readNativeImagePart } from "./native-image";

it("rejects malformed blob references rather than treating paths as image bytes", () => {
  for (const data of [
    "blob:sha256:../../secret",
    `blob:sha256:${"a".repeat(63)}`,
    `blob:sha256:${"A".repeat(64)}`,
    `blob:sha256:${"a".repeat(64)}/other`,
  ])
    expect(
      NativeImagePartSchema.safeParse({
        type: "image",
        mimeType: "image/png",
        data,
      }).success,
    ).toBe(false);
});

it("only reads a regular, bounded, matching blob inside the trusted directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "d-pi-image-blob-"));
  const bytes = Buffer.from("fixture image bytes");
  const digest = createHash("sha256").update(bytes).digest("hex");
  const path = join(directory, digest);
  const image = NativeImagePartSchema.parse({
    type: "image",
    mimeType: "image/png",
    data: `blob:sha256:${digest}`,
  });
  try {
    expect(await readNativeImagePart(image, directory)).toEqual({
      kind: "unavailable",
      reason: "missing",
    });
    const outside = join(directory, "other");
    await writeFile(outside, bytes);
    await symlink(outside, path);
    expect(await readNativeImagePart(image, directory)).toEqual({
      kind: "unavailable",
      reason: "denied",
    });
    await rm(path);
    await writeFile(path, bytes);
    expect(await readNativeImagePart(image, directory)).toEqual({
      kind: "image",
      dataUrl: `data:image/png;base64,${bytes.toString("base64")}`,
    });
    await writeFile(path, "different bytes");
    expect(await readNativeImagePart(image, directory)).toEqual({
      kind: "unavailable",
      reason: "changed",
    });
    await truncate(path, 32 * 1024 * 1024 + 1);
    expect(await readNativeImagePart(image, directory)).toEqual({
      kind: "unavailable",
      reason: "unsupported",
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

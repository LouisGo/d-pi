import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hydrateImageResources } from "../../runtime/image-input.mjs";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
  "base64",
);
const policy = {
  imageBytes: 10 * 1024 * 1024,
  totalImageBytes: 40 * 1024 * 1024,
  encodedBytes: 64 * 1024 * 1024,
};
test("hydrates the frozen private digest only at the SDK boundary", async () => {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "dpi-image-resource-")),
  );
  try {
    const bytes = Buffer.concat([png, Buffer.alloc(908202 - png.length)]);
    const digest = createHash("sha256").update(bytes).digest("hex");
    await mkdir(join(root, "objects"));
    await writeFile(join(root, "objects", digest), bytes);
    const frame = {
      id: "fixture",
      type: "prompt",
      message: "解释这张图片",
      images: [
        {
          type: "image",
          mimeType: "image/png",
          resource: { digest, byteLength: bytes.length },
        },
      ],
    };
    assert.ok(JSON.stringify(frame).length < 1024);
    const output = await hydrateImageResources(frame, root, policy);
    assert.equal(output.images[0].data, bytes.toString("base64"));
    assert.equal(output.images[0].resource, undefined);
    assert.equal(frame.images[0].resource.digest, digest);
    await writeFile(join(root, "objects", digest), Buffer.alloc(bytes.length));
    await assert.rejects(
      hydrateImageResources(frame, root, policy),
      /content-corrupt/,
    );
    await rm(join(root, "objects", digest));
    await assert.rejects(
      hydrateImageResources(frame, root, policy),
      /content-missing/,
    );
    await writeFile(join(root, "outside"), bytes);
    await symlink(join(root, "outside"), join(root, "objects", digest));
    await assert.rejects(
      hydrateImageResources(frame, root, policy),
      /content-corrupt/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("retains legacy inline images but rejects forged paths, lengths, MIME and budgets", async () => {
  const old = {
    type: "prompt",
    images: [
      { type: "image", mimeType: "image/png", data: png.toString("base64") },
    ],
  };
  assert.equal(await hydrateImageResources(old, undefined, policy), old);
  const resource = {
    type: "prompt",
    images: [
      {
        type: "image",
        mimeType: "image/png",
        resource: { digest: "../outside", byteLength: 1 },
      },
    ],
  };
  await assert.rejects(
    hydrateImageResources(resource, "/tmp", policy),
    /content-corrupt/,
  );
  resource.images[0].resource.digest = "a".repeat(64);
  resource.images[0].resource.byteLength = policy.imageBytes + 1;
  await assert.rejects(
    hydrateImageResources(resource, "/tmp", policy),
    /transport-too-large/,
  );
  await assert.rejects(
    hydrateImageResources(
      { ...resource, images: resource.images.slice() },
      undefined,
      policy,
    ),
    /content-missing|transport-too-large/,
  );
});
test("does not forward a prepared image if Stop or its epoch changes during reading", async () => {
  const { prepareImageInput } = await import("../../runtime/image-input.mjs");
  let admit = true,
    release;
  const hydration = new Promise((resolve) => {
    release = resolve;
  });
  const frame = {
    type: "prompt",
    images: [{ resource: { digest: "a".repeat(64), byteLength: 100 } }],
  };
  const pending = prepareImageInput(
    frame,
    "/private",
    policy,
    () => admit,
    () => hydration,
  );
  admit = false;
  release({ type: "prompt", images: [{ data: "should not forward" }] });
  assert.deepEqual(await pending, { kind: "rejected", reason: "paused" });
});

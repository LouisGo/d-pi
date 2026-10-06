import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Drive the shipped bridge and controls against this harness's isolated data. */
export async function validateAttachmentLifecycle({
  db,
  data,
  threadId,
  evaluate,
  wait,
  click,
  dropAttachment,
  shot,
  screenshots,
  checks,
}) {
  const objectPath = (bytes) =>
    join(
      data,
      "content",
      "objects",
      createHash("sha256").update(bytes).digest("hex"),
    );
  const request = (kind) =>
    evaluate(`window.desktop.attachments.request({
    kind:${JSON.stringify(kind)},threadId:${JSON.stringify(threadId)},traceId:crypto.randomUUID()
  })`);
  const retained = Buffer.from("M2_LIFECYCLE_PRIVATE_ORIGINAL\n");
  await dropAttachment(
    "lifecycle-retained.txt",
    "text/plain",
    retained.toString("base64"),
  );
  await wait(() =>
    db
      .prepare("SELECT body FROM thread WHERE id=?")
      .get(threadId)
      .body.includes("[[dpi-attachment:"),
  );
  let report = await request("check-storage");
  assert.equal(report.kind, "storage-report");
  await evaluate(
    "document.querySelector('[data-attachment-storage-action=clean]').click()",
  );
  await wait(() =>
    evaluate("!!document.querySelector('[data-attachment-storage-report]')"),
  );
  assert.ok(
    existsSync(objectPath(retained)),
    "explicit cleanup removed a current draft original",
  );

  // Failure must keep the input, and reimporting exact bytes repairs the object.
  const draftBefore = db
    .prepare("SELECT body FROM thread WHERE id=?")
    .get(threadId).body;
  rmSync(objectPath(retained));
  report = await request("check-storage");
  assert.ok(
    report.issues.some(
      (issue) =>
        issue.name === "lifecycle-retained.txt" &&
        issue.reason === "content-missing",
    ),
  );
  await evaluate(
    "document.querySelector('[data-attachment-storage-action=check]').click()",
  );
  await wait(() =>
    evaluate(
      "document.querySelector('[data-attachment-storage-report]')?.textContent.includes('lifecycle-retained.txt')",
    ),
  );
  assert.equal(
    db.prepare("SELECT body FROM thread WHERE id=?").get(threadId).body,
    draftBefore,
  );
  screenshots.push(await shot("m2-lifecycle-missing-original"));
  await dropAttachment(
    "lifecycle-repair.txt",
    "text/plain",
    retained.toString("base64"),
  );
  report = await request("check-storage");
  assert.ok(
    !report.issues.some(
      (issue) =>
        issue.name.startsWith("lifecycle-") &&
        issue.reason === "content-missing",
    ),
  );
  writeFileSync(objectPath(retained), "M2_CORRUPTED_ORIGINAL");
  report = await request("check-storage");
  assert.ok(report.issues.some((issue) => issue.reason === "content-corrupt"));
  await dropAttachment(
    "lifecycle-repaired.txt",
    "text/plain",
    retained.toString("base64"),
  );
  report = await request("check-storage");
  assert.ok(
    !report.issues.some(
      (issue) =>
        issue.name.startsWith("lifecycle-") &&
        issue.reason === "content-corrupt",
    ),
  );
  for (const name of [
    "lifecycle-retained.txt",
    "lifecycle-repair.txt",
    "lifecycle-repaired.txt",
  ])
    await click("移除 " + name);
  await wait(
    () =>
      !db
        .prepare("SELECT body FROM thread WHERE id=?")
        .get(threadId)
        .body.includes("[[dpi-attachment:"),
  );
  report = await request("clean-storage");
  assert.equal(report.kind, "storage-report");
  assert.ok(report.deletedObjects > 0);
  assert.ok(!existsSync(objectPath(retained)));
  checks.push(
    "packaged attachment cleanup protects current persistent drafts; missing/corrupt originals are reported without input loss, exact reimport repairs shared bytes, and explicit cleanup removes only released objects",
  );
}

export async function prepareAgedAttachment({
  db,
  data,
  threadId,
  evaluate,
  wait,
  click,
  dropAttachment,
}) {
  // Age only this isolated orphan. Automatic maintenance must collect it without
  // a clean-storage command, either at the next sweep or the cold App restart.
  const aged = Buffer.from("M2_LIFECYCLE_SEVEN_DAY_ORPHAN\n");
  await dropAttachment(
    "lifecycle-aged.txt",
    "text/plain",
    aged.toString("base64"),
  );
  await click("移除 lifecycle-aged.txt");
  await wait(
    () =>
      !db
        .prepare("SELECT body FROM thread WHERE id=?")
        .get(threadId)
        .body.includes("[[dpi-attachment:"),
  );
  await evaluate(
    `window.desktop.attachments.request({kind:'check-storage',threadId:${JSON.stringify(threadId)},traceId:crypto.randomUUID()})`,
  );
  const hash = createHash("sha256").update(aged).digest("hex");
  assert.equal(
    db
      .prepare(
        "SELECT reference_count FROM input_content_object WHERE digest=?",
      )
      .get(hash).reference_count,
    0,
  );
  db.prepare(
    "UPDATE input_content_object SET last_released_at=? WHERE digest=?",
  ).run(Date.now() - 8 * 24 * 60 * 60 * 1000, hash);
  return join(data, "content", "objects", hash);
}

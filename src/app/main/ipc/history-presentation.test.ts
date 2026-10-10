import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { readNativeHistory } from "../../../modules/conversation/main/public";
import { SubmissionReceiptSchema } from "../../../modules/execution/contracts/public";
import { AttachmentStore } from "../../../modules/input/main/public";
import { presentSavedInput } from "./history-presentation";

const threadId = crypto.randomUUID();
const attachmentId = crypto.randomUUID();
const text = "Explain this file.\n[[dpi-attachment:" + attachmentId + "]]";
const payload =
  "Explain this file.\n\n[notes.md]\nfrozen file content\n[/attachment]\n";
const binding = {
  threadId,
  sessionId: "native",
  configContextId: "config",
  sessionFile: "/unused",
};
function receipt(rawText = text, sessionFile = "/unused") {
  return SubmissionReceiptSchema.parse({
    submissionId: crypto.randomUUID(),
    threadId,
    traceId: crypto.randomUUID(),
    revision: 1,
    text: rawText,
    target: {
      nativeSessionRef: sessionFile,
      configContextId: "config",
      processInstanceId: crypto.randomUUID(),
      connectionGeneration: crypto.randomUUID(),
    },
    requestId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    state: "acknowledged",
    acknowledgedAt: new Date().toISOString(),
    outcome: "unobserved",
    content: {
      schemaVersion: 1,
      message: payload,
      images: [],
      sources: [
        {
          attachmentId,
          inputDigest: "a".repeat(64),
          representation: "text",
          converterVersion: "utf-8",
          coverageGaps: [],
          byteLength: 19,
          name: "notes.md",
        },
      ],
      rawBytes: 19,
    },
  });
}
it("presents frozen file metadata and original prompt only for a matching session payload", () => {
  const entry = { id: "user", parentId: null, role: "user", text: payload };
  const shown = presentSavedInput(entry, binding, [receipt()]);
  expect(shown.displayText).toBe("Explain this file.");
  expect(shown.files).toHaveLength(1);
  expect(shown.text.slice(shown.files![0]!.start, shown.files![0]!.end)).toBe(
    "frozen file content",
  );
  expect(presentSavedInput(entry, binding, [receipt(text, "other")])).toEqual(
    entry,
  );
  expect(
    presentSavedInput(entry, binding, [receipt(), receipt("Different prompt")]),
  ).toEqual(entry);
  expect(
    presentSavedInput({ ...entry, text: "literal [notes.md]" }, binding, [
      receipt(),
    ]).displayText,
  ).toBeUndefined();
});

it("does not present a truncated file preview when its content embeds the attachment delimiter", () => {
  const dangerousPayload = payload.replace(
    "frozen file content",
    "first\n[/attachment]\nsecond",
  );
  const candidate = receipt();
  candidate.content!.message = dangerousPayload;
  const shown = presentSavedInput(
    { id: "file", parentId: null, role: "user", text: dangerousPayload },
    binding,
    [candidate],
  );
  expect(shown.files?.[0]?.start).toBeUndefined();
});

it("preserves inline file placement, repetitions and line breaks from the submitted draft", () => {
  const draft = `Before [[dpi-attachment:${attachmentId}]] after\nAgain [[dpi-attachment:${attachmentId}]]`;
  const entry = { id: "user", parentId: null, role: "user", text: payload };
  const shown = presentSavedInput(entry, binding, [receipt(draft)]);
  expect(shown.inputParts).toEqual([
    { kind: "text", text: "Before " },
    { kind: "file", index: 0 },
    { kind: "text", text: " after\nAgain " },
    { kind: "file", index: 0 },
  ]);
  expect(shown.files?.[0]).toMatchObject({ contextKind: "external" });
});

it.each(["inline", "blob"])(
  "preserves md + txt inline after native image transcoding (%s), including a fresh history read",
  async (storage) => {
    const root = await mkdtemp(join(tmpdir(), "d-pi-mixed-input-"));
    const connection = new DatabaseSync(":memory:");
    connection.exec(
      "CREATE TABLE thread(id TEXT PRIMARY KEY); CREATE TABLE input_attachment(id TEXT PRIMARY KEY,thread_id TEXT NOT NULL,payload TEXT NOT NULL);",
    );
    connection.prepare("INSERT INTO thread VALUES(?)").run(threadId);
    try {
      const store = new AttachmentStore({
        directory: join(root, "attachments"),
        database: { connection },
        validateImage: async () => true,
      });
      const md = await store.importBytes(threadId, {
        name: "report.md",
        mimeType: "text/markdown",
        bytes: new TextEncoder().encode("# frozen markdown"),
        source: "file",
      });
      const txt = await store.importBytes(threadId, {
        name: "notes.txt",
        mimeType: "text/plain",
        bytes: new TextEncoder().encode("frozen plain text"),
        source: "file",
      });
      const image = await store.importBytes(threadId, {
        name: "shot.png",
        mimeType: "image/png",
        bytes: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1EAAAAASUVORK5CYII=",
          "base64",
        ),
        source: "paste",
      });
      const draft = `Before ${md.token} between ${txt.token} after\n${image.token}`;
      const prepared = await store.prepare(threadId, draft);
      if (!prepared.ok) throw Error(prepared.reason);
      const sessionDirectory = join(root, threadId);
      await mkdir(sessionDirectory);
      const sessionFile = join(sessionDirectory, "session.jsonl");
      const nativeBinding = { ...binding, sessionFile };
      const candidate = receipt(draft, sessionFile);
      candidate.content = prepared.content;
      // OMP normalizes model images before appending history, changing MIME and bytes.
      // This is the persisted shape observed in the failing real mixed submission.
      const normalizedDigest = "b".repeat(64);
      await writeFile(
        sessionFile,
        [
          { type: "session", version: 3, id: "native" },
          {
            type: "message",
            id: "mixed",
            parentId: null,
            message: {
              role: "user",
              content: [
                { type: "text", text: prepared.content.message },
                {
                  type: "image",
                  mimeType: "image/webp",
                  data:
                    storage === "blob"
                      ? `blob:sha256:${normalizedDigest}`
                      : "dHJhbnNjb2RlZA==",
                },
              ],
            },
          },
        ]
          .map((value) => JSON.stringify(value))
          .join("\n") + "\n",
      );
      for (let read = 0; read < 2; read++) {
        const page = await readNativeHistory(root, nativeBinding);
        if (page.kind !== "page") throw Error("missing native history");
        const entry = page.entries[0]!;
        const shown = presentSavedInput(entry, nativeBinding, [candidate]);
        expect(shown.images).toEqual(entry.images);
        expect(shown.images).toHaveLength(1);
        expect(shown.images![0]!.mimeType).toBe("image/webp");
        expect(shown.images![0]!.digest).not.toBe(image.inputDigest);
        expect(shown.inputParts).toEqual([
          { kind: "text", text: "Before " },
          { kind: "file", index: 0 },
          { kind: "text", text: " between " },
          { kind: "file", index: 1 },
          { kind: "text", text: " after\n" },
        ]);
        expect(
          shown.files?.map((file) => shown.text.slice(file.start, file.end)),
        ).toEqual(["# frozen markdown", "frozen plain text"]);
        expect(presentSavedInput(entry, nativeBinding, [])).toEqual(entry);
        expect(
          presentSavedInput({ ...entry, images: [] }, nativeBinding, [
            candidate,
          ]),
        ).toEqual({ ...entry, images: [] });
        expect(
          presentSavedInput(
            entry,
            { ...nativeBinding, configContextId: "other" },
            [candidate],
          ),
        ).toEqual(entry);
        const ambiguous = {
          ...candidate,
          text: draft.replace("Before ", "Different "),
        };
        expect(
          presentSavedInput(entry, nativeBinding, [candidate, ambiguous]),
        ).toEqual(entry);
      }
    } finally {
      connection.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);

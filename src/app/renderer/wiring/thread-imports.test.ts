// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import {
  type AttachmentReply,
  type AttachmentRequest,
  AttachmentSchema,
  DraftSchema,
} from "../../../modules/input/contracts/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { ThreadModel } from "./thread-model";

it("PDF consent uses the original Thread bridge and accepted IDs before explicit adoption", async () => {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "original",
  });
  const id = crypto.randomUUID();
  const pdf = AttachmentSchema.parse({
    schemaVersion: 1,
    id,
    threadId: draft.threadId,
    token: `[[dpi-attachment:${id}]]`,
    name: "partial.pdf",
    mimeType: "application/pdf",
    byteLength: 3,
    capturedAt: new Date().toISOString(),
    source: "paste",
    status: "failed",
    representation: "pdf-text",
    coverageGaps: ["visual-content"],
    textOnly: false,
    reason: "pdf-coverage-gap",
  });
  const attachments = vi.fn<
    (command: AttachmentRequest) => Promise<AttachmentReply>
  >(async (command) => {
    if (command.kind === "import-bytes")
      return { kind: "attachments", items: [pdf] };
    if (command.kind === "set-text-only")
      return {
        kind: "attachments",
        items: [
          AttachmentSchema.parse({
            ...pdf,
            status: "ready",
            textOnly: true,
            reason: undefined,
          }),
        ],
      };
    if (command.kind === "import-settle") return { kind: "import-settled" };
    throw Error("unexpected command");
  });
  const bridge: DesktopBridge = {
    request: async (command) =>
      parseDesktopReply(command, {
        kind: "saved",
        threadId: draft.threadId,
        revision: 1,
      }),
    attachments: { request: attachments },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const a = new ThreadModel(draft, bridge, () => {
    throw Error("unexpected failure");
  });
  const b = new ThreadModel(
    DraftSchema.parse({ ...draft, threadId: crypto.randomUUID() }),
    bridge,
    () => {
      throw Error("unexpected failure");
    },
  );
  try {
    const model = a.attachmentImports;
    if (!model) throw Error("missing imports");
    const batch = model.importFiles(
      [new File(["pdf"], "partial.pdf")],
      "paste",
    );
    await vi.waitFor(() => expect(model.stateStore.getState().pending).toBe(0));
    const job = model.stateStore.getState().batches[0]?.jobs[0];
    if (!batch || !job) throw Error("missing batch");
    expect(await model.confirmTextOnly(job.id)).toBe(true);
    expect(attachments.mock.calls[1]?.[0]).toMatchObject({
      kind: "set-text-only",
      threadId: draft.threadId,
      id: pdf.id,
      value: true,
    });
    expect(a.canPrepareInput()).toBe(false);
    expect(b.canPrepareInput()).toBe(true);
    const editor = { applyBatch: vi.fn(() => true) };
    model.attachEditor(editor);
    expect(model.insertReady(batch)).toBe(true);
    await vi.waitFor(() => expect(a.canPrepareInput()).toBe(true));
    const imported = attachments.mock.calls[0]?.[0];
    if (imported?.kind !== "import-bytes")
      throw Error("missing import operation");
    expect(attachments.mock.calls[2]?.[0]).toMatchObject({
      kind: "import-settle",
      threadId: draft.threadId,
      operationId: imported.operationId,
      disposition: "adopt",
    });
    expect(b.controller.getTextSnapshot()).toBe("original");
    expect(attachments).toHaveBeenCalledTimes(3);
  } finally {
    a.dispose();
    b.dispose();
  }
});

it("Thread readiness includes uninserted batches, sibling failure and pending trusted settlement across freeze and disposal", async () => {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "original",
  });
  const otherDraft = DraftSchema.parse({
    ...draft,
    threadId: crypto.randomUUID(),
  });
  let finish: (reply: AttachmentReply) => void = () => {};
  const attachments = vi.fn<
    (command: AttachmentRequest) => Promise<AttachmentReply>
  >(async (command) => {
    if (command.kind === "import-settle") return { kind: "import-settled" };
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const bridge: DesktopBridge = {
    request: async (command) =>
      parseDesktopReply(command, {
        kind: "saved",
        threadId: draft.threadId,
        revision: 1,
      }),
    attachments: { request: attachments },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const a = new ThreadModel(draft, bridge, () => {
    throw Error("unexpected failure");
  });
  const b = new ThreadModel(otherDraft, bridge, () => {
    throw Error("unexpected failure");
  });
  try {
    const imports = a.attachmentImports;
    if (!imports) throw Error("missing importer");
    const batch = imports.importFiles(
      [new File(["source"], "one.txt")],
      "paste",
    );
    expect(a.canPrepareInput()).toBe(false);
    expect(b.canPrepareInput()).toBe(true);
    await vi.waitFor(() => expect(attachments).toHaveBeenCalledTimes(1));
    const release = a.freezeInputSources();
    const id = crypto.randomUUID();
    const item = AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      threadId: draft.threadId,
      token: `[[dpi-attachment:${id}]]`,
      name: "one.txt",
      mimeType: "text/plain",
      byteLength: 6,
      capturedAt: new Date().toISOString(),
      source: "paste",
      status: "ready",
      representation: "text",
      coverageGaps: [],
      textOnly: false,
    });
    finish({ kind: "attachments", items: [item] });
    await vi.waitFor(() =>
      expect(imports.stateStore.getState().pending).toBe(0),
    );
    expect(a.canPrepareInput()).toBe(false);
    expect(b.canPrepareInput()).toBe(true);
    const editor = { applyBatch: vi.fn(() => true) };
    imports.attachEditor(editor);
    if (!batch) throw Error("missing batch");
    expect(imports.insertReady(batch)).toBe(false);
    release();
    expect(imports.insertReady(batch)).toBe(true);
    await vi.waitFor(() => expect(a.canPrepareInput()).toBe(true));
    expect(
      attachments.mock.calls.map(([command]) => [
        command.kind,
        command.threadId,
      ]),
    ).toEqual([
      ["import-bytes", draft.threadId],
      ["import-settle", draft.threadId],
    ]);
    imports.importFiles([new File(["late"], "late.txt")], "drop");
    await vi.waitFor(() => expect(attachments).toHaveBeenCalledTimes(3));
    a.dispose();
    finish({ kind: "attachments", items: [item] });
    await vi.waitFor(() => expect(attachments).toHaveBeenCalledTimes(4));
    expect(attachments.mock.calls[3]?.[0]).toMatchObject({
      kind: "import-settle",
      threadId: draft.threadId,
      disposition: "release",
    });
    expect(b.canPrepareInput()).toBe(true);
    expect(b.controller.getTextSnapshot()).toBe("original");
  } finally {
    a.dispose();
    b.dispose();
  }
});

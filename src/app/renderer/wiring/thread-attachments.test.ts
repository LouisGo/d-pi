import { expect, it, vi } from "vitest";
import type { SubmissionReply } from "../../../modules/execution/contracts/public";
import {
  type AttachmentReply,
  DraftSchema,
} from "../../../modules/input/contracts/public";
import { serializeReference } from "../../../modules/input/core/public";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { ThreadModel } from "./thread-model";

it("composes isolated attachment and submission lifecycles per Thread without mounting a view", async () => {
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "A draft",
  });
  const second = DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    text: "B draft",
  });
  let finish: (reply: AttachmentReply) => void = () => {};
  const sources: string[] = [];
  const request = vi.fn(
    async (): Promise<SubmissionReply> => ({ kind: "list", receipts: [] }),
  );
  const bridge: DesktopBridge = {
    request: async (command) =>
      parseDesktopReply(command, {
        kind: "saved",
        threadId: first.threadId,
        revision: 1,
      }),
    attachments: {
      request: (command) => {
        sources.push(command.threadId);
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
    submission: { request, subscribe: () => () => {} },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const failure = () => {
    throw Error("unexpected failure");
  };
  const a = new ThreadModel(first, bridge, failure);
  const b = new ThreadModel(second, bridge, failure);
  try {
    if (!a.attachments || !b.attachments || !a.submission || !b.submission)
      throw Error("missing resources");
    const oldInsert = vi.fn(() => true);
    const detach = a.attachments.attachEditor({ insert: oldInsert });
    const pending = a.attachments.run({ kind: "choose-import" }, true);
    detach();
    const otherInsert = vi.fn(() => true);
    b.attachments.attachEditor({ insert: otherInsert });
    expect(a.canPrepareInput()).toBe(false);
    expect(b.canPrepareInput()).toBe(true);
    await a.submission.send();
    expect(request).toHaveBeenCalledTimes(2); // only each owner's initial receipt read
    finish({ kind: "unavailable", reason: "source-too-large" });
    await pending;
    expect(a.canPrepareInput()).toBe(false);
    expect(b.canPrepareInput()).toBe(true);
    expect(oldInsert).not.toHaveBeenCalled();
    expect(otherInsert).not.toHaveBeenCalled();
    expect(sources).toEqual([first.threadId]);
    expect(a.controller.getTextSnapshot()).toBe("A draft");
    expect(b.controller.getTextSnapshot()).toBe("B draft");
    a.attachments.removeFailure();
    expect(a.canPrepareInput()).toBe(true);
    a.dispose();
    a.dispose();
    expect(a.canPrepareInput()).toBe(false);
  } finally {
    a.dispose();
    b.dispose();
  }
});

it("keeps Main-confirmed manifest failures in the active body blocked after the editor detaches", async () => {
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "body",
  });
  const id = crypto.randomUUID();
  const token = `[[dpi-attachment:${id}]]`;
  const request = vi.fn(
    async (): Promise<SubmissionReply> => ({ kind: "list", receipts: [] }),
  );
  const bridge: DesktopBridge = {
    request: async (command) =>
      parseDesktopReply(command, {
        kind: "saved",
        threadId: draft.threadId,
        revision: 1,
      }),
    attachments: {
      request: async () => ({
        kind: "attachments",
        items: [
          {
            schemaVersion: 1,
            id,
            threadId: draft.threadId,
            token,
            name: "source.pdf",
            mimeType: "application/pdf",
            byteLength: 4,
            capturedAt: new Date().toISOString(),
            source: "file",
            status: "failed",
            reason: "pdf-conversion-failed",
            representation: "pdf-text",
            coverageGaps: [],
            textOnly: false,
          },
        ],
      }),
    },
    submission: { request, subscribe: () => () => {} },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  const model = new ThreadModel(draft, bridge, () => {
    throw Error("unexpected failure");
  });
  try {
    if (!model.attachments || !model.submission)
      throw Error("missing resources");
    const detach = model.attachments.attachEditor({
      insert: (item) => {
        model.controller.edit(`body ${item.token}`);
        return true;
      },
    });
    await model.attachments.run({ kind: "choose-import" }, true);
    detach();
    expect(model.canPrepareInput()).toBe(false);
    await model.submission.send();
    expect(request).toHaveBeenCalledTimes(1);
    expect(model.controller.getTextSnapshot()).toBe(`body ${token}`);
    model.controller.edit("body without the failed source");
    expect(model.canPrepareInput()).toBe(true);
    const frozen = serializeReference({
      kind: "selection",
      path: "source.ts",
      source: "working-tree",
      version: "v1",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: token.length + 1,
      text: token,
    });
    model.controller.edit(frozen);
    expect(model.controller.getAttachmentIds()).toEqual([]);
    expect(model.canPrepareInput()).toBe(true);
  } finally {
    model.dispose();
  }
});

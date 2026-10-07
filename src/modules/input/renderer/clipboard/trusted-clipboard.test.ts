// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { expect, it } from "vitest";
import { ThreadIdSchema } from "../../../../shared/identity";
import type { AttachmentBridge, AttachmentReply } from "../../contracts/public";
import { CLIPBOARD_MIME } from "../../contracts/public";
import { AttachmentModel } from "../../core/attachments/attachment-model";
import { serializeReference } from "../../core/references/serialize";
import {
  clearDraftHistory,
  draftDocument,
  plainTextEditorOptions,
} from "../editor/plain-text-editor";
import { createTrustedClipboard } from "./trusted-clipboard";

it("writes ticket synchronously, waits for Main, inserts the whole trusted fragment as one Undo and ignores consumed/changed editor results", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID()),
    oldId = crypto.randomUUID(),
    newId = crypto.randomUUID();
  const ticket = {
    version: 1 as const,
    instanceId: crypto.randomUUID(),
    handleId: crypto.randomUUID(),
    expiresAt: Date.now() + 10000,
  };
  let finish!: (reply: AttachmentReply) => void,
    sequence = 0;
  const calls: string[] = [];
  const bridge: AttachmentBridge = {
    request: async (command) => {
      calls.push(command.kind);
      if (command.kind === "clipboard-reserve")
        return { kind: "clipboard-tickets", tickets: [ticket] };
      if (command.kind === "clipboard-import")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return { kind: "clipboard-exported", degraded: false };
    },
  };
  const model = new AttachmentModel(bridge, threadId);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(`before [[dpi-attachment:${oldId}]]`),
  });
  editor.view.updateState(
    editor.state.reconfigure({ plugins: editor.extensionManager.plugins }),
  );
  const feedback: (string | null)[] = [];
  const clipboard = createTrustedClipboard({
    bridge,
    model,
    isCurrent: () => true,
    sequence: () => sequence,
    onFeedback: (value) => feedback.push(value),
  });
  const data = new Map<string, string>();
  const event = {
    clipboardData: {
      types: ["text/plain"],
      getData: (kind: string) => data.get(kind) ?? "",
      setData: (kind: string, value: string) => data.set(kind, value),
      files: [],
    },
    preventDefault() {},
  } as unknown as ClipboardEvent;
  try {
    await clipboard.warm();
    editor.commands.selectAll();
    expect(clipboard.copy(editor.view, event, false)).toBe(true);
    expect(data.get(CLIPBOARD_MIME)).toContain(ticket.handleId);
    expect(data.get("text/plain")).not.toContain(oldId);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    const frozen = serializeReference({
      kind: "selection",
      path: "src/a.ts",
      source: "source",
      version: "v1",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 4,
      text: "raw",
    });
    const text = `pasted [[dpi-attachment:${newId}]]\n${frozen}\ntail`;
    expect(clipboard.paste(editor.view, event)).toBe(true);
    expect(model.stateStore.getState().pending).toBe(1);
    finish({ kind: "clipboard-imported", text, items: [], degraded: false });
    await clipboard.settled();
    expect(editor.getText({ blockSeparator: "\n" })).toContain(text);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText({ blockSeparator: "\n" })).toBe(
      `before [[dpi-attachment:${oldId}]]`,
    );
    expect(editor.commands.redo()).toBe(true);
    clipboard.paste(editor.view, event);
    sequence++;
    finish({
      kind: "clipboard-imported",
      text: "late",
      items: [],
      degraded: false,
    });
    await clipboard.settled();
    expect(editor.getText({ blockSeparator: "\n" })).not.toContain("late");
    expect(calls).toContain("clipboard-discard");
  } finally {
    clipboard.dispose();
    model.dispose();
    editor.destroy();
  }
});

it("falls back visibly for unknown handles and cut remains one undo action with readable HTML", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID()),
    id = crypto.randomUUID();
  const ticket = {
    version: 1 as const,
    instanceId: crypto.randomUUID(),
    handleId: crypto.randomUUID(),
    expiresAt: Date.now() + 10000,
  };
  const bridge: AttachmentBridge = {
    request: async (command) =>
      command.kind === "clipboard-reserve"
        ? { kind: "clipboard-tickets", tickets: [ticket] }
        : { kind: "clipboard-unavailable", reason: "invalid" },
  };
  const model = new AttachmentModel(bridge, threadId);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(`text [[dpi-attachment:${id}]]`),
  });
  const feedback: (string | null)[] = [];
  const clipboard = createTrustedClipboard({
    bridge,
    model,
    isCurrent: () => true,
    sequence: () => 0,
    onFeedback: (value) => feedback.push(value),
  });
  const data = new Map<string, string>();
  const event = {
    clipboardData: {
      types: ["text/plain", CLIPBOARD_MIME],
      getData: (kind: string) => data.get(kind) ?? "",
      setData: (kind: string, value: string) => data.set(kind, value),
      files: [],
    },
    preventDefault() {},
  } as unknown as ClipboardEvent;
  try {
    await clipboard.warm();
    editor.commands.selectAll();
    expect(clipboard.copy(editor.view, event, true)).toBe(true);
    expect(editor.getText()).toBe("");
    expect(data.get("text/html")).toContain("text [attachment:");
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toContain(id);
    editor.commands.selectAll();
    clipboard.paste(editor.view, event);
    await clipboard.settled();
    expect(editor.getText()).not.toContain(id);
    expect(feedback).toContain("fallback");
  } finally {
    clipboard.dispose();
    model.dispose();
    editor.destroy();
  }
});

it("rejects an old paste after the real Undo epoch is cleared without changing body, selection or consume sequence", async () => {
  const threadId = ThreadIdSchema.parse(crypto.randomUUID());
  const ticket = {
    version: 1 as const,
    instanceId: crypto.randomUUID(),
    handleId: crypto.randomUUID(),
    expiresAt: Date.now() + 10000,
  };
  let finish!: (reply: AttachmentReply) => void;
  const bridge: AttachmentBridge = {
    request: async (command) =>
      command.kind === "clipboard-import"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { kind: "cancelled" },
  };
  const model = new AttachmentModel(bridge, threadId);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("same"),
  });
  const clipboard = createTrustedClipboard({
    bridge,
    model,
    isCurrent: () => true,
    sequence: () => 0,
    onFeedback: () => {},
  });
  clipboard.bindEditor(editor);
  const event = {
    clipboardData: {
      types: [CLIPBOARD_MIME, "text/plain"],
      getData: (type: string) =>
        type === CLIPBOARD_MIME ? JSON.stringify(ticket) : "fallback",
    },
    preventDefault() {},
  } as unknown as ClipboardEvent;
  try {
    clipboard.paste(editor.view, event);
    clearDraftHistory(editor);
    finish({
      kind: "clipboard-imported",
      text: "late",
      items: [],
      degraded: false,
    });
    await clipboard.settled();
    expect(editor.getText()).toBe("same");
  } finally {
    clipboard.dispose();
    model.dispose();
    editor.destroy();
  }
});

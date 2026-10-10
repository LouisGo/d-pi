// @vitest-environment happy-dom
import { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { afterEach, expect, it } from "vitest";
import { AttachmentSchema } from "../../contracts/public";
import {
  draftDocument,
  plainTextEditorOptions,
} from "../editor/plain-text-editor";
import { syncAttachmentLabels } from "./attachment-editor";
import { attachmentNodeAttrs } from "./attachment-reference";
import { navigateReference, selectedReference } from "./reference-interaction";

const editors: Editor[] = [];
afterEach(() => {
  for (const editor of editors.splice(0)) editor.destroy();
});
function fixture(
  source: "file" | "reference",
  frozen = false,
  overrides: Record<string, unknown> = {},
) {
  const id = crypto.randomUUID();
  const item = AttachmentSchema.parse({
    schemaVersion: 1,
    id,
    threadId: crypto.randomUUID(),
    name: "runtime-service.ts",
    path: "src/runtime-service.ts",
    token: `[[dpi-attachment:${id}]]`,
    mimeType: "text/plain",
    byteLength: 20,
    inputDigest: "a".repeat(64),
    capturedAt: new Date().toISOString(),
    source,
    referenceKind: source === "reference" || frozen ? "file" : undefined,
    status: "ready",
    representation: source === "reference" ? "reference" : "text",
    coverageGaps: [],
    textOnly: false,
    ...overrides,
    ...(frozen
      ? {
          frozenReference: {
            projectPath: "/fixture",
            path: "src/runtime-service.ts",
            kind: "file",
            version: "v1",
            capturedAt: new Date().toISOString(),
          },
        }
      : {}),
  });
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(`a${item.token}b`),
  });
  editors.push(editor);
  syncAttachmentLabels(editor, [item]);
  return {
    editor,
    item,
    element: editor.view.dom.querySelector<HTMLElement>("[data-attachment-id]"),
  };
}
it.each([false, true])(
  "presents live or frozen project context only as an inline file chip (frozen=%s)",
  (frozen) => {
    const { editor, item, element } = fixture(
      frozen ? "file" : "reference",
      frozen,
    );
    expect(element?.dataset.contextKind).toBe("project");
    expect(element?.hidden).toBe(false);
    expect(element?.textContent).toBe("runtime-service.ts");
    expect(editor.getText()).toBe(`a${item.token}b`);
  },
);
it("renders an external non-image as an inline MIME chip with its size and immutable token", () => {
  const { editor, item, element } = fixture("file", false, {
    name: "research.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    byteLength: 225280,
  });
  expect(element?.hidden).toBe(false);
  expect(element?.dataset.fileKind).toBe("document");
  expect(element?.querySelector("svg")).not.toBeNull();
  expect(element?.querySelector(".composer-context-size")?.textContent).toBe(
    "220 KB",
  );
  expect(element?.textContent).toContain("research.docx");
  expect(element?.dataset.contextKind).toBe("external");
  expect(editor.getText()).toBe(`a${item.token}b`);
  expect(editor.state.doc.firstChild?.child(1).isAtom).toBe(true);
});
it("crosses the external attachment anchor without selecting an invisible chip", () => {
  const { editor } = fixture("file", false, {
    mimeType: "image/png",
    representation: "image",
  });
  editor.view.dispatch(
    editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
  );
  expect(
    navigateReference(
      editor,
      new KeyboardEvent("keydown", { key: "ArrowRight" }),
    ),
  ).toBe(true);
  expect(selectedReference(editor)).toBeNull();
  expect(editor.state.selection.head).toBe(3);
  expect(editor.state.selection.empty).toBe(true);
});
it.each([
  { key: "ArrowRight", start: 2, end: 5 },
  { key: "ArrowLeft", start: 5, end: 2 },
])(
  "crosses a whole consecutive external batch with one $key and preserves Shift's anchor",
  ({ key, start, end }) => {
    const { editor, item } = fixture("file", false, {
      mimeType: "image/png",
      representation: "image",
    });
    const items = [
      item,
      { ...item, id: crypto.randomUUID() },
      { ...item, id: crypto.randomUUID() },
    ];
    editor.commands.setContent(
      draftDocument(
        `a${items.map((entry) => `[[dpi-attachment:${entry.id}]]`).join("")}b`,
      ),
    );
    syncAttachmentLabels(editor, items);
    for (const shiftKey of [false, true]) {
      editor.view.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, start),
        ),
      );
      expect(
        navigateReference(
          editor,
          new KeyboardEvent("keydown", { key, shiftKey }),
        ),
      ).toBe(true);
      expect(editor.state.selection.head).toBe(end);
      expect(editor.state.selection.anchor).toBe(shiftKey ? start : end);
    }
  },
);

it.each(["reference", "file"] as const)(
  "keeps an image project reference inline (source=%s)",
  (source) => {
    const { element } = fixture(source, source === "file", {
      name: "diagram.png",
      mimeType: "image/png",
      representation: source === "reference" ? "reference" : "image",
    });
    expect(element?.hidden).toBe(false);
    expect(element?.dataset.contextKind).toBe("project");
    expect(element?.dataset.fileKind).toBe("image");
  },
);
it("keeps unresolved manifest tokens hidden until real metadata is supplied", () => {
  const { editor, item } = fixture("file");
  editor.commands.setContent(draftDocument(`a${item.token}b`));
  const element = editor.view.dom.querySelector<HTMLElement>(
    "[data-attachment-id]",
  );
  expect(element?.hidden).toBe(true);
  expect(element?.dataset.contextKind).toBe("unresolved");
  expect(editor.getText()).toBe(`a${item.token}b`);
});
it("exposes localized failure in the chip's accessible name and Tooltip without a duplicate panel", () => {
  const { editor, item } = fixture("file", false, {
    name: "研究.docx",
    mimeType: "application/msword",
    status: "failed",
    reason: "unsupported-format",
    representation: "unsupported",
  });
  editor.view.dispatch(
    editor.state.tr
      .setNodeMarkup(2, undefined, attachmentNodeAttrs(item, "zh-CN"))
      .setMeta("addToHistory", false),
  );
  const element = editor.view.dom.querySelector<HTMLElement>(
    "[data-attachment-id]",
  );
  expect(element?.hidden).toBe(false);
  expect(element?.dataset.status).toBe("failed");
  expect(element?.getAttribute("aria-label")).toContain("暂不支持此文件格式。");
  expect(element?.getAttribute("data-composer-tag-tooltip")).toContain(
    "暂不支持此文件格式。",
  );
  expect(element?.textContent).toBe("研究.docx20 B");
  expect(element?.querySelector(".composer-context-status svg")).not.toBeNull();
  expect(editor.getText()).toBe(`a${item.token}b`);
});
it.each([false, true])(
  "preserves PDF coverage information on the inline chip (textOnly=%s)",
  (textOnly) => {
    const { element } = fixture("file", false, {
      name: "report.pdf",
      mimeType: "application/pdf",
      representation: "pdf-text",
      coverageGaps: ["images-not-extracted"],
      textOnly,
    });
    expect(element?.dataset.status).toBe("partial");
    expect(element?.getAttribute("aria-label")).toContain(
      textOnly ? "Sends PDF text only" : "Some PDF content is missing",
    );
    expect(
      element?.querySelector(".composer-context-status svg"),
    ).not.toBeNull();
  },
);
it("escapes long CJK filename markup while retaining its full name for details", () => {
  const name = `${"很长的研究材料".repeat(20)}<img src=x>.docx`;
  const { element } = fixture("file", false, {
    name,
    mimeType: "application/msword",
  });
  expect(element?.querySelector(".composer-context-name")?.textContent).toBe(
    `${name.slice(0, 21)}…${name.slice(-14)}`,
  );
  expect(element?.querySelector("img")).toBeNull();
  expect(element?.getAttribute("data-composer-tag-tooltip")).toContain(name);
});

it.each([
  ["render.tsx", "react"],
  ["feedback.ts", "typescript"],
  ["translations.json", "json"],
  ["report.md", "markdown"],
  ["report.pdf", "pdf"],
  ["budget.xlsx", "table"],
  ["legacy.xls", "table"],
  ["summary.docx", "document"],
  ["notes.txt", "text"],
  ["data.csv", "table"],
  ["archive.zip", "zip"],
  ["photo.png", "image"],
  ["unknown.custom", "generic"],
])(
  "uses the file glyph for %s without a duplicate type label",
  (name, glyph) => {
    const { element } = fixture("reference", false, { name });
    expect(element?.querySelector(".composer-context-type")?.textContent).toBe(
      "",
    );
    expect(element?.querySelector("svg")?.getAttribute("data-file-icon")).toBe(
      glyph,
    );
    expect(element?.getAttribute("aria-label")).toContain(name);
  },
);

it.each([
  ["report.pdf", "application/pdf", "pdf"],
  [
    "budget.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "document",
  ],
  ["legacy.xls", "application/vnd.ms-excel", "document"],
  [
    "summary.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "document",
  ],
  ["notes.txt", "text/plain", "text"],
  ["data.csv", "text/csv", "text"],
  ["archive.zip", "application/zip", "archive"],
  ["unknown.custom", "application/octet-stream", "generic"],
])(
  "keeps external %s as a visible inline tag with size, full tooltip and immutable content",
  (name, mimeType, kind) => {
    const { editor, item, element } = fixture("file", false, {
      name,
      mimeType,
      byteLength: 13312,
    });
    expect(element?.hidden).toBe(false);
    expect(element?.dataset.fileKind).toBe(kind);
    expect(element?.getAttribute("data-composer-tag-tone")).toBe("blue");
    expect(element?.querySelector(".composer-context-type")?.textContent).toBe(
      "",
    );
    expect(element?.querySelector(".composer-context-size")?.textContent).toBe(
      "13 KB",
    );
    expect(element?.getAttribute("data-composer-tag-tooltip")).toBe(
      name + "\n13 KB",
    );
    expect(editor.getText()).toBe(`a${item.token}b`);
  },
);

it("keeps authoritative PDF MIME presentation even when the source filename ends with png", () => {
  const { element } = fixture("file", false, {
    name: "misnamed.png",
    mimeType: "application/pdf",
  });
  expect(element?.querySelector("svg")?.getAttribute("data-file-icon")).toBe(
    "pdf",
  );
});

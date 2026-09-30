// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { htmlToEditableMarkdown } from "./structured-paste";

it("keeps headings, nested lists, table cells and links as editable Markdown source", () => {
  expect(
    htmlToEditableMarkdown(
      '<h2>Plan</h2><ul><li>one<ul><li>nested</li></ul></li><li>two</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>x|y</td><td><a href="https://example.test/a?q=b">link</a></td></tr></table>',
    ),
  ).toBe(
    "## Plan\n\n- one\n  - nested\n- two\n\n| A | B |\n| --- | --- |\n| x\\|y | [link](https://example.test/a?q=b) |",
  );
});
it("retains code whitespace and multiline quotes without importing executable HTML", () => {
  expect(
    htmlToEditableMarkdown(
      "<script>alert(1)</script><pre><code>  a &lt; b\n\n  next</code></pre><blockquote><p>first</p><p>second</p></blockquote>",
    ),
  ).toBe("```\n  a < b\n\n  next\n```\n\n> first\n>\n> second");
});
it("uses plain source when rich clipboard HTML is only a wrapper around Markdown", () => {
  expect(
    htmlToEditableMarkdown(
      "<div><span>## already source</span><br><span>second</span></div>",
    ),
  ).toBe("## already source\nsecond");
});

it("pastes editable rich source as one undoable change, while explicit plain paste preserves the alternate literal text", async () => {
  const { Editor } = await import("@tiptap/core");
  const { plainTextEditorOptions } = await import("./plain-text-editor");
  const { createClipboardPaste } = await import("./plain-text-paste");
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
  });
  const paste = createClipboardPaste();
  const clipboard = new DataTransfer();
  clipboard.setData("text/plain", "Title\noriginal words");
  clipboard.setData("text/html", "<h1>Title</h1><p>original words</p>");
  const event = new ClipboardEvent("paste", { clipboardData: clipboard });
  try {
    paste.handlePaste(editor.view, event);
    expect(editor.getText({ blockSeparator: "\n" })).toBe(
      "# Title\n\noriginal words",
    );
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getText()).toBe("");
    expect(editor.commands.redo()).toBe(true);
    editor.commands.selectAll();
    paste.keyDown(
      new KeyboardEvent("keydown", { key: "v", metaKey: true, shiftKey: true }),
    );
    paste.handlePaste(editor.view, event);
    expect(editor.getText({ blockSeparator: "\n" })).toBe(
      "Title\noriginal words",
    );
    editor.commands.selectAll();
    paste.handlePaste(editor.view, event);
    expect(editor.getText({ blockSeparator: "\n" })).toBe(
      "# Title\n\noriginal words",
    );
  } finally {
    editor.destroy();
  }
});

it("does not invent column headers in a headerless table", () => {
  expect(
    htmlToEditableMarkdown("<table><tr><td>A</td><td>B</td></tr></table>"),
  ).toBe("|  |  |\n| --- | --- |\n| A | B |");
});
it("blocks mixed image paste with explicit feedback before modifying existing draft", async () => {
  const { Editor } = await import("@tiptap/core");
  const { plainTextEditorOptions } = await import("./plain-text-editor");
  const { createClipboardPaste } = await import("./plain-text-paste");
  let failures = 0;
  const paste = createClipboardPaste(() => failures++);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
  });
  editor.commands.insertContent("kept draft");
  const clipboard = new DataTransfer();
  clipboard.setData("text/plain", "mixed words");
  clipboard.setData(
    "text/html",
    '<h1>mixed words</h1><img src="https://example.test/private.png">',
  );
  try {
    expect(
      paste.handlePaste(
        editor.view,
        new ClipboardEvent("paste", { clipboardData: clipboard }),
      ),
    ).toBe(true);
    expect(failures).toBe(1);
    expect(editor.getText()).toBe("kept draft");
    paste.keyDown(
      new KeyboardEvent("keydown", { key: "v", metaKey: true, shiftKey: true }),
    );
    paste.handlePaste(
      editor.view,
      new ClipboardEvent("paste", { clipboardData: clipboard }),
    );
    expect(editor.getText()).toBe("kept draftmixed words");
    expect(failures).toBe(1);
  } finally {
    editor.destroy();
  }
});

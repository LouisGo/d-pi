// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Editor } from "@tiptap/core";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Attachment } from "../../../modules/input/contracts/public";
import {
  draftDocument,
  plainTextEditorOptions,
} from "../../../modules/input/renderer/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
import { ThreadIdSchema } from "../../../shared/identity";
import type { AttachmentReply } from "../../contracts/attachments";
import { AttachmentControls } from "./attachment-controls";

vi.mock("../../../modules/preferences/renderer/public", () => ({
  useI18n: () => createI18n("en-US"),
}));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});
const id = ThreadIdSchema.parse("f9b0037d-1b8b-4f82-988c-7ca64f93fa37");
it("mounts the formal attachment controls and removes a failed atomic reference without changing surrounding text", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const token = `[[dpi-attachment:${id}]]`;
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(`before ${token} after`),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    editor.destroy();
    client.clear();
    container.remove();
  });
  const bridge = {
    request: vi.fn(async () => ({
      kind: "attachments" as const,
      items: [
        {
          schemaVersion: 1 as const,
          id,
          token,
          threadId: id,
          name: "failed.pdf",
          mimeType: "application/pdf",
          byteLength: 1,
          capturedAt: new Date().toISOString(),
          source: "file" as const,
          status: "failed" as const,
          reason: "pdf-coverage-gap" as const,
          representation: "pdf-text" as const,
          coverageGaps: ["pages-needing-ocr"],
          textOnly: false,
        },
      ],
    })),
  };
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: createElement(AttachmentControls, {
          bridge,
          threadId: id,
          editor,
          text: `before ${token} after`,
          isCurrent: () => true,
          onBlocked: () => {},
          mention: null,
          dismissMention: () => {},
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(container.textContent).toContain("failed.pdf");
  expect(container.textContent).toContain("PDF");
  const remove = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove failed.pdf"]',
  );
  expect(remove).not.toBeNull();
  await act(() => remove?.click());
  expect(editor.getText({ blockSeparator: "\n" })).toBe("before  after");
});

it("isolates a late @ search and inserts the chosen full path as one undoable reference", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("review @src"),
  });
  editor.commands.setTextSelection(12);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    editor.destroy();
    client.clear();
    container.remove();
  });
  let finishSearch: (value: {
    kind: "search";
    paths: string[];
    truncated: boolean;
  }) => void = () => {};
  let searched = false;
  const actions = {
    current: null as import("./attachment-controls").AttachmentActions | null,
  };
  const item = {
    schemaVersion: 1 as const,
    id,
    threadId: id,
    token: `[[dpi-attachment:${id}]]`,
    name: "src/a@b.ts",
    mimeType: "text/plain",
    byteLength: 0,
    capturedAt: new Date().toISOString(),
    source: "reference" as const,
    path: "src/a@b.ts",
    status: "ready" as const,
    representation: "reference" as const,
    coverageGaps: [],
    textOnly: false,
  };
  const request = vi.fn(
    async (
      command: import("../../contracts/attachments").AttachmentRequest,
    ): Promise<import("../../contracts/attachments").AttachmentReply> => {
      if (command.kind === "search-reference") {
        searched = true;
        return new Promise((resolve) => {
          finishSearch = resolve;
        });
      }
      if (command.kind === "add-reference")
        return { kind: "attachments", items: [item] };
      return { kind: "attachments", items: [] };
    },
  );
  let current = true;
  const render = (
    mention: ReturnType<
      typeof import("../../../modules/input/renderer/public").attachmentMention
    >,
  ) =>
    act(() =>
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: createElement(AttachmentControls, {
            bridge: { request },
            threadId: id,
            editor,
            text: "review @src",
            isCurrent: () => current,
            onBlocked: () => {},
            mention,
            dismissMention: () => {},
            ref: actions,
          }),
        }),
      ),
    );
  await render({ from: 8, to: 12, query: "src" });
  await vi.waitFor(() => expect(searched).toBe(true));
  await render(null);
  await act(() =>
    finishSearch({ kind: "search", paths: ["src/stale.ts"], truncated: false }),
  );
  expect(container.textContent).not.toContain("src/stale.ts");
  await render({ from: 8, to: 12, query: "src" });
  await act(() =>
    finishSearch({ kind: "search", paths: ["src/a@b.ts"], truncated: false }),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    actions.current?.handleMentionKey(
      new KeyboardEvent("keydown", { key: "Enter" }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(
    request.mock.calls.some(
      ([command]) =>
        command.kind === "add-reference" && command.path === "src/a@b.ts",
    ),
  ).toBe(true);
  expect(editor.getText()).toBe(`review ${item.token}`);
  expect(editor.state.doc.firstChild?.child(1).isAtom).toBe(true);
  editor.commands.undo();
  expect(editor.getText()).toBe("review @src");
  current = false;
});

it("identifies a ready reference that failed during send-time freezing without rewriting its preparation state", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const token = `[[dpi-attachment:${id}]]`;
  const item = {
    schemaVersion: 1 as const,
    id,
    threadId: id,
    token,
    name: "src/a@b.ts",
    mimeType: "text/plain",
    byteLength: 0,
    capturedAt: new Date().toISOString(),
    source: "reference" as const,
    path: "src/a@b.ts",
    status: "ready" as const,
    representation: "reference" as const,
    coverageGaps: [],
    textOnly: false,
  };
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(token),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    editor.destroy();
    client.clear();
    container.remove();
  });
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: createElement(AttachmentControls, {
          bridge: {
            request: async (): Promise<AttachmentReply> => ({
              kind: "attachments",
              items: [item],
            }),
          },
          threadId: id,
          editor,
          text: token,
          isCurrent: () => true,
          onBlocked: () => {},
          mention: null,
          dismissMention: () => {},
          preparationFailure: {
            reason: "reference-unavailable",
            attachmentId: id,
          },
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const alert = container.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain("src/a@b.ts");
  expect(alert?.textContent).toContain(
    "Referenced file is missing or unreadable",
  );
  expect(alert?.textContent).toContain("Sending reads this reference again");
  expect(container.textContent).toContain("Read when sending");
  expect(item.status).toBe("ready");
});

it("permits explicit re-preparation of a failed @PDF after text-only consent while keeping the reference atomic", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const token = `[[dpi-attachment:${id}]]`;
  const item: Attachment = {
    schemaVersion: 1,
    id,
    threadId: id,
    token,
    name: "docs/chart@report.pdf",
    mimeType: "application/pdf",
    byteLength: 120,
    capturedAt: new Date().toISOString(),
    source: "reference",
    path: "docs/chart@report.pdf",
    status: "failed",
    reason: "pdf-coverage-gap",
    representation: "reference",
    coverageGaps: ["visual-content", "ocr-pages:1"],
    textOnly: true,
  };
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(token),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    editor.destroy();
    client.clear();
    container.remove();
  });
  const onBlocked = vi.fn();
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: createElement(AttachmentControls, {
          bridge: {
            request: async (): Promise<AttachmentReply> => ({
              kind: "attachments",
              items: [item],
            }),
          },
          threadId: id,
          editor,
          text: token,
          isCurrent: () => true,
          onBlocked,
          mention: null,
          dismissMention: () => {},
          preparationFailure: { reason: "pdf-coverage-gap", attachmentId: id },
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(container.textContent).toContain("Text-only PDF");
  expect(container.textContent).toContain("Read when sending");
  expect(container.textContent).toContain(
    "PDF text extraction has coverage gaps",
  );
  expect(onBlocked).toHaveBeenLastCalledWith(false);
  expect(editor.getText()).toBe(token);
  expect(editor.state.doc.firstChild?.firstChild?.isAtom).toBe(true);
  expect(item.status).toBe("failed");
});

it("opens a natively modal preview with an accessible filename heading and keeps truncation explicit", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const token = `[[dpi-attachment:${id}]]`;
  const item: Attachment = {
    schemaVersion: 1,
    id,
    threadId: id,
    token,
    name: "report.pdf",
    mimeType: "application/pdf",
    byteLength: 100,
    capturedAt: new Date().toISOString(),
    source: "file",
    status: "ready",
    representation: "pdf-text",
    coverageGaps: [],
    textOnly: false,
  };
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument(token),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    editor.destroy();
    client.clear();
    container.remove();
  });
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: createElement(AttachmentControls, {
          bridge: {
            request: async (command): Promise<AttachmentReply> =>
              command.kind === "preview"
                ? { kind: "text", text: "sample extract", truncated: true }
                : { kind: "attachments", items: [item] },
          },
          threadId: id,
          editor,
          text: token,
          isCurrent: () => true,
          onBlocked: () => {},
          mention: null,
          dismissMention: () => {},
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const preview = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Preview report.pdf",
  );
  if (!preview) throw Error("missing preview button");
  await act(async () => {
    preview.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const dialog = container.querySelector("dialog");
  expect(dialog?.open).toBe(true);
  const labelledBy = dialog?.getAttribute("aria-labelledby");
  expect(labelledBy).toBeTruthy();
  expect(
    labelledBy ? document.getElementById(labelledBy)?.textContent : null,
  ).toBe("report.pdf");
  expect(dialog?.textContent).toContain("Only the first 64 KiB is previewed");
});

it("reports the typed oversized-source rejection instead of a transport failure and keeps sending blocked until explicit removal", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("retained draft"),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    editor.destroy();
    client.clear();
    container.remove();
  });
  const onBlocked = vi.fn();
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: createElement(AttachmentControls, {
          bridge: {
            request: async (command): Promise<AttachmentReply> =>
              command.kind === "choose-import"
                ? { kind: "unavailable", reason: "source-too-large" }
                : { kind: "attachments", items: [] },
          },
          threadId: id,
          editor,
          text: "retained draft",
          isCurrent: () => true,
          onBlocked,
          mention: null,
          dismissMention: () => {},
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const attach = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Attach files",
  );
  if (!attach) throw Error("missing attachment button");
  await act(async () => {
    attach.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "25 MiB limit",
  );
  expect(container.querySelector('[role="alert"]')?.textContent).not.toContain(
    "Attachment request failed",
  );
  expect(onBlocked).toHaveBeenLastCalledWith(true);
  expect(editor.getText()).toBe("retained draft");
  const remove = Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === "Remove this failed attachment request",
  );
  if (!remove) throw Error("missing removal");
  await act(() => remove.click());
  expect(onBlocked).toHaveBeenLastCalledWith(false);
});

it.each([
  ["preview", false],
  ["preview", true],
  ["retry", false],
  ["retry", true],
  ["set-text-only", false],
  ["set-text-only", true],
] as const)(
  "retains a failed import across unrelated %s operations (transport failure: %s)",
  async (operation, rejectOperation) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const token = `[[dpi-attachment:${id}]]`;
    const item: Attachment = {
      schemaVersion: 1,
      id,
      threadId: id,
      token,
      name: "existing.pdf",
      mimeType: "application/pdf",
      byteLength: 100,
      capturedAt: new Date().toISOString(),
      source: "reference",
      path: "existing.pdf",
      status: "failed",
      reason: "pdf-coverage-gap",
      representation: "reference",
      coverageGaps: ["visual-content"],
      textOnly: false,
    };
    const editor = new Editor({
      ...plainTextEditorOptions,
      element: document.createElement("div"),
      content: draftDocument(token),
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    cleanups.push(async () => {
      await act(() => root.unmount());
      editor.destroy();
      client.clear();
      container.remove();
    });
    const onBlocked = vi.fn();
    const request = vi.fn(
      async (
        command: import("../../contracts/attachments").AttachmentRequest,
      ): Promise<AttachmentReply> => {
        if (command.kind === "choose-import")
          return { kind: "unavailable", reason: "source-too-large" };
        if (command.kind === operation && rejectOperation)
          throw Error("transport disconnected");
        if (command.kind === "preview")
          return { kind: "text", text: "existing source" };
        return { kind: "attachments", items: [item] };
      },
    );
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: createElement(AttachmentControls, {
            bridge: { request },
            threadId: id,
            editor,
            text: token,
            isCurrent: () => true,
            onBlocked,
            mention: null,
            dismissMention: () => {},
          }),
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(onBlocked).toHaveBeenLastCalledWith(false);
    const attach = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Attach files",
    );
    if (!attach) throw Error("missing attachment control");
    await act(async () => {
      attach.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(onBlocked).toHaveBeenLastCalledWith(true);
    const label =
      operation === "preview"
        ? "Preview existing.pdf"
        : operation === "retry"
          ? "Retry preparation"
          : "Use extracted text only";
    const unrelated = Array.from(
      container.querySelectorAll<HTMLButtonElement>("ol button"),
    ).find((button) => button.textContent === label);
    if (!unrelated) throw Error("missing unrelated operation");
    await act(async () => {
      unrelated.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(
      request.mock.calls.some(([command]) => command.kind === operation),
    ).toBe(true);
    expect(container.textContent).toContain("25 MiB limit");
    expect(onBlocked).toHaveBeenLastCalledWith(true);
    expect(editor.getText()).toBe(token);
  },
);

it.each(["success", "cancelled"] as const)(
  "resolves a failed import only through its explicit retry (%s)",
  async (outcome) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const editor = new Editor({
      ...plainTextEditorOptions,
      element: document.createElement("div"),
      content: draftDocument("original draft"),
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    cleanups.push(async () => {
      await act(() => root.unmount());
      editor.destroy();
      client.clear();
      container.remove();
    });
    const onBlocked = vi.fn();
    let attempts = 0;
    const item: Attachment = {
      schemaVersion: 1,
      id,
      threadId: id,
      token: `[[dpi-attachment:${id}]]`,
      name: "replacement.txt",
      mimeType: "text/plain",
      byteLength: 3,
      capturedAt: new Date().toISOString(),
      source: "file",
      status: "ready",
      representation: "text",
      coverageGaps: [],
      textOnly: false,
    };
    const request = vi.fn(
      async (
        command: import("../../contracts/attachments").AttachmentRequest,
      ): Promise<AttachmentReply> => {
        if (command.kind === "choose-import") {
          attempts++;
          if (attempts === 1)
            return { kind: "unavailable", reason: "source-too-large" };
          return outcome === "success"
            ? { kind: "attachments", items: [item] }
            : { kind: "cancelled" };
        }
        return { kind: "attachments", items: [] };
      },
    );
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: createElement(AttachmentControls, {
            bridge: { request },
            threadId: id,
            editor,
            text: "original draft",
            isCurrent: () => true,
            onBlocked,
            mention: null,
            dismissMention: () => {},
          }),
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const attach = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Attach files",
    );
    if (!attach) throw Error("missing attach");
    await act(async () => {
      attach.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(onBlocked).toHaveBeenLastCalledWith(true);
    expect(attach.disabled).toBe(true);
    const retry = container.querySelector<HTMLButtonElement>(
      '[role="alert"] button',
    );
    if (!retry) throw Error("missing explicit retry");
    await act(async () => {
      retry.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(attempts).toBe(2);
    expect(onBlocked).toHaveBeenLastCalledWith(outcome === "cancelled");
    if (outcome === "cancelled")
      expect(container.textContent).toContain("25 MiB limit");
    else expect(container.textContent).not.toContain("25 MiB limit");
    expect(editor.getText()).toContain("original draft");
  },
);

it("offers storage checking and explicit unreferenced cleanup, locates broken originals, and preserves editor input", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("my preserved draft"),
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    editor.destroy();
    client.clear();
    container.remove();
  });
  const request = vi.fn(
    async (
      command: import("../../contracts/attachments").AttachmentRequest,
    ): Promise<AttachmentReply> => {
      if (command.kind === "check-storage" || command.kind === "clean-storage")
        return {
          kind: "storage-report",
          checkedObjects: 2,
          remainingObjects: 0,
          retainedObjects: 1,
          unreferencedObjects: 1,
          deletedObjects: command.kind === "clean-storage" ? 1 : 0,
          deletedBytes: 3,
          issues: [
            {
              attachmentId: id,
              name: "lost original.txt",
              object: "original",
              reason: "content-missing",
            },
          ],
          issuesTruncated: false,
        };
      return { kind: "attachments", items: [] };
    },
  );
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: createElement(AttachmentControls, {
          bridge: { request },
          threadId: id,
          editor,
          text: "my preserved draft",
          isCurrent: () => true,
          onBlocked: () => {},
          mention: null,
          dismissMention: () => {},
        }),
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const check = container.querySelector<HTMLButtonElement>(
    '[data-attachment-storage-action="check"]',
  );
  expect(check).not.toBeNull();
  await act(async () => {
    check?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(
    container.querySelector("[data-attachment-storage-report]")?.textContent,
  ).toContain("lost original.txt");
  const clean = container.querySelector<HTMLButtonElement>(
    '[data-attachment-storage-action="clean"]',
  );
  await act(async () => {
    clean?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(
    request.mock.calls.filter(([command]) => command.kind === "clean-storage"),
  ).toHaveLength(1);
  expect(editor.getText()).toBe("my preserved draft");
});

// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Editor } from "@tiptap/core";
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { Attachment } from "../../../modules/input/contracts/public";
import { AttachmentModel } from "../../../modules/input/core/public";
import {
  AttachmentImports,
  draftDocument,
  plainTextEditorOptions,
  type ReferenceTrigger,
} from "../../../modules/input/renderer/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
import { ThreadIdSchema } from "../../../shared/identity";
import type {
  AttachmentReply,
  AttachmentRequest,
} from "../../contracts/attachments";
import {
  type AttachmentActions,
  AttachmentControls,
} from "./attachment-controls";

// Fixture owns the Thread resources; views only receive the same instances.
const resources = new WeakMap<
  object,
  { model: AttachmentModel; imports: AttachmentImports }
>();
function controls(
  props: Omit<Parameters<typeof AttachmentControls>[0], "model" | "imports"> & {
    owner?: object;
  },
) {
  const key = props.owner ?? props.editor ?? props.bridge;
  let owned = resources.get(key);
  if (!owned) {
    const model = new AttachmentModel(props.bridge, props.threadId);
    const imports = new AttachmentImports(async (input) => {
      const reply = await model.run({ kind: "import-bytes", ...input }, true);
      if (reply?.kind !== "attachments") throw Error("Import failed");
      return reply.items;
    });
    owned = { model, imports };
    resources.set(key, owned);
    cleanups.push(async () => {
      model.dispose();
      imports.dispose();
    });
  }
  const actions = createRef<AttachmentActions>();
  return createElement(
    "div",
    {},
    createElement(AttachmentControls, {
      ...props,
      ...owned,
      ref: (value) => {
        actions.current = value;
        if (typeof props.ref === "function") props.ref(value);
        else if (props.ref) props.ref.current = value;
      },
    }),
    // Composer owns the toolbar; this host exercises the same imperative port.
    createElement(
      "button",
      { onClick: () => actions.current?.chooseImport() },
      "Attach files",
    ),
  );
}

vi.mock("../../../modules/preferences/renderer/public", () => ({
  useI18n: () => createI18n("en-US"),
}));
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});
const id = ThreadIdSchema.parse("f9b0037d-1b8b-4f82-988c-7ca64f93fa37");
it("distinguishes frozen provenance from live references in the formal controls", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const token = `[[dpi-attachment:${id}]]`;
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
  const item: Attachment = {
    schemaVersion: 1,
    id,
    threadId: id,
    token,
    name: "original.txt",
    mimeType: "text/plain",
    byteLength: 12,
    source: "paste",
    status: "ready",
    representation: "text",
    coverageGaps: [],
    textOnly: false,
    capturedAt: "2026-10-07T00:00:00.000Z",
    inputDigest: "a".repeat(64),
    path: "src/original.txt",
    referenceKind: "file",
    frozenReference: {
      projectPath: "/actual/source/project",
      path: "src/original.txt",
      kind: "file",
      version: "source-version-1",
      capturedAt: "2026-10-07T00:00:00.000Z",
    },
  };
  const bridge = {
    request: async () => ({ kind: "attachments" as const, items: [item] }),
  };
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: controls({
          bridge,
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
  });
  await act(async () => {
    await vi.waitFor(() =>
      expect(container.textContent).toContain("original.txt"),
    );
  });
  expect(container.textContent).toContain("Frozen on copy");
  expect(container.textContent).toContain("/actual/source/project");
  expect(container.textContent).toContain("source-version-1");
  expect(container.textContent).toContain("2026-10-07T00:00:00.000Z");
  expect(container.textContent).not.toContain("Read when sending");
});
it("offers only retry for an unfinished clipboard cleanup and confirms its original IDs", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const editor = new Editor({
    ...plainTextEditorOptions,
    element: document.createElement("div"),
    content: draftDocument("body"),
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
  const attempts: string[][] = [];
  const bridge = {
    request: vi.fn(
      async (command: AttachmentRequest): Promise<AttachmentReply> => {
        if (command.kind === "clipboard-discard") {
          attempts.push(command.ids);
          return attempts.length === 1
            ? { kind: "unavailable", reason: "storage-unavailable" }
            : { kind: "cancelled" };
        }
        return { kind: "attachments", items: [] };
      },
    ),
  };
  await act(() => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: controls({
          bridge,
          threadId: id,
          editor,
          text: "body",
          isCurrent: () => true,
          onBlocked: () => {},
          mention: null,
          dismissMention: () => {},
        }),
      }),
    );
  });
  const owned = resources.get(editor);
  if (!owned) throw Error("missing Thread-owned attachment model");
  const cloneId = crypto.randomUUID();
  await act(() =>
    owned.model.run({ kind: "clipboard-discard", ids: [cloneId] }),
  );
  expect(owned.model.getReadiness().kind).toBe("blocked");
  const buttons = Array.from(container.querySelectorAll("button"));
  const { t } = createI18n("en-US");
  expect(
    buttons.some(
      (button) =>
        button.textContent?.trim() === t("attachment.dismissFailedRequest"),
    ),
  ).toBe(false);
  const retry = buttons.find(
    (button) => button.textContent?.trim() === t("attachment.retry"),
  );
  expect(retry).toBeDefined();
  await act(async () => {
    retry?.click();
    await vi.waitFor(() =>
      expect(owned.model.stateStore.getState().failed).toBeNull(),
    );
  });
  expect(attempts).toEqual([[cloneId], [cloneId]]);
  expect(owned.model.getReadiness().kind).toBe("ready");
  expect(editor.getText()).toBe("body");
});
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
        children: controls({
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

it.each([
  { path: "src/a@b.ts", kind: "file" as const },
  { path: "src/@virtualList", kind: "directory" as const },
])(
  "isolates late @ searches and inserts a typed $kind as one undoable reference",
  async ({ path, kind }) => {
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
      entries: { path: string; name: string; kind: "file" | "directory" }[];
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
      name: path,
      referenceKind: kind,
      mimeType: "text/plain",
      byteLength: 0,
      capturedAt: new Date().toISOString(),
      source: "reference" as const,
      path,
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
    const render = (mention: ReferenceTrigger | null) =>
      act(() =>
        root.render(
          createElement(QueryClientProvider, {
            client,
            children: controls({
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
    await render({ from: 8, to: 12, query: "src", expectedSource: "@src" });
    await vi.waitFor(() => expect(searched).toBe(true));
    await render(null);
    await act(() =>
      finishSearch({
        kind: "search",
        entries: [{ path: "src/stale.ts", name: "stale.ts", kind: "file" }],
        truncated: false,
      }),
    );
    expect(container.textContent).not.toContain("src/stale.ts");
    await render({ from: 8, to: 12, query: "src", expectedSource: "@src" });
    await act(() =>
      finishSearch({
        kind: "search",
        entries: [{ path, name: path.split("/").at(-1) ?? path, kind }],
        truncated: false,
      }),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(
      container
        .querySelector(`[data-reference-kind="${kind}"]`)
        ?.getAttribute("aria-label"),
    ).toBe(path);
    await act(async () => {
      actions.current?.handleMentionKey(
        new KeyboardEvent("keydown", { key: "Enter" }),
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(
      request.mock.calls.some(
        ([command]) =>
          command.kind === "add-reference" &&
          command.path === path &&
          command.referenceKind === kind,
      ),
    ).toBe(true);
    expect(editor.getText()).toBe(`review ${item.token}`);
    expect(editor.state.doc.firstChild?.child(1).isAtom).toBe(true);
    editor.commands.undo();
    expect(editor.getText()).toBe("review @src");
    current = false;
  },
);

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
        children: controls({
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
        children: controls({
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

it.each(["button", "cancel"] as const)(
  "closes the native preview before unmount and restores editor focus via %s",
  async (method) => {
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
          children: controls({
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
    container.append(editor.view.dom);
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
    if (!dialog) throw Error("missing preview dialog");
    const closedWhileMounted: boolean[] = [];
    const nativeClose = vi.spyOn(dialog, "close").mockImplementation(() => {
      // Native close releases the top layer and restores its previous focus.
      if (!dialog.open) return;
      closedWhileMounted.push(dialog.isConnected);
      dialog.open = false;
      preview.focus();
    });
    await act(async () => {
      if (method === "cancel")
        dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
      else dialog.querySelector<HTMLButtonElement>("button")?.click();
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(closedWhileMounted).toEqual([true]);
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(editor.view.dom);
    nativeClose.mockRestore();
  },
);

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
        children: controls({
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
          children: controls({
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
          children: controls({
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
    // The actual toolbar now lives in Composer; this host checks the source gate.
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
      return {
        kind: "attachments",
        items: [
          {
            schemaVersion: 1,
            id,
            threadId: id,
            token: `[[dpi-attachment:${id}]]`,
            name: "saved.txt",
            mimeType: "text/plain",
            byteLength: 3,
            capturedAt: new Date().toISOString(),
            source: "file",
            status: "ready",
            representation: "text",
            coverageGaps: [],
            textOnly: false,
          },
        ],
      };
    },
  );
  await act(async () => {
    root.render(
      createElement(QueryClientProvider, {
        client,
        children: controls({
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
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const check = container.querySelector<HTMLButtonElement>(
    '[data-attachment-storage-action="check"]',
  );
  expect(check).not.toBeNull();
  expect(check?.closest("details")?.textContent).toContain("saved.txt");
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

it("coalesces quick @ edits, hides old-query results, consumes Enter while waiting and refreshes explicitly", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const actions = {
    current: null as import("./attachment-controls").AttachmentActions | null,
  };
  cleanups.push(async () => {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  });
  const request = vi.fn(
    async (
      command: import("../../contracts/attachments").AttachmentRequest,
    ): Promise<AttachmentReply> =>
      command.kind === "search-reference"
        ? {
            kind: "search",
            entries: [
              {
                path: `src/${command.query}`,
                name: command.query,
                kind: "directory",
              },
            ],
            truncated: false,
          }
        : { kind: "attachments", items: [] },
  );
  const render = (query: string) =>
    act(() =>
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: controls({
            threadId: id,
            bridge: { request },
            editor: null,
            text: "",
            isCurrent: () => true,
            onBlocked: () => {},
            mention: {
              query,
              from: 0,
              to: query.length + 1,
              expectedSource: `@${query}`,
            },
            dismissMention: () => {},
            ref: actions,
          }),
        }),
      ),
    );
  const searches = () =>
    request.mock.calls.filter(
      ([command]) => command.kind === "search-reference",
    );
  await render("@v");
  await vi.waitFor(() => expect(searches()).toHaveLength(1));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  for (const query of ["@vi", "@vir", "@virt", "@virtual", "@virtualList"])
    await render(query);
  expect(container.textContent).not.toContain("src/@v");
  expect(
    actions.current?.handleMentionKey(
      new KeyboardEvent("keydown", { key: "Enter" }),
    ),
  ).toBe(true);
  expect(
    request.mock.calls.some(([command]) => command.kind === "add-reference"),
  ).toBe(false);
  await vi.waitFor(() => expect(searches()).toHaveLength(2));
  await vi.waitFor(() =>
    expect(
      container.querySelector('[role="option"]')?.getAttribute("aria-label"),
    ).toBe("src/@virtualList"),
  );
  expect(searches()[1]?.[0]).toMatchObject({
    query: "@virtualList",
    refresh: false,
  });
  const refresh = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Refresh search",
  );
  await act(async () => refresh?.click());
  await vi.waitFor(() => expect(searches()).toHaveLength(3));
  expect(searches()[2]?.[0]).toMatchObject({ refresh: true });
  await render("@virtualList/new");
  await vi.waitFor(() => expect(searches()).toHaveLength(4));
  expect(searches()[3]?.[0]).toMatchObject({ refresh: false });
  await vi.waitFor(() =>
    expect(
      container.querySelector('[role="option"]')?.getAttribute("aria-label"),
    ).toBe("src/@virtualList/new"),
  );
  request.mockImplementation(async (command) => {
    if (command.kind === "search-reference") throw Error("refresh failed");
    return { kind: "attachments", items: [] };
  });
  await act(async () => refresh?.click());
  await vi.waitFor(() =>
    expect(container.querySelector('[role="alert"]')).not.toBeNull(),
  );
  expect(container.querySelector('[role="option"]')).toBeNull();
  await act(async () => {
    expect(
      actions.current?.handleMentionKey(
        new KeyboardEvent("keydown", { key: "Enter" }),
      ),
    ).toBe(true);
  });
  expect(
    request.mock.calls.some(([command]) => command.kind === "add-reference"),
  ).toBe(false);
});

it("retains an unresolved required-source failure after replacing its view with the same Thread owner", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const owner = {};
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
  const onBlocked = vi.fn();
  let choose = 0;
  const bridge = {
    request: async (
      command: import("../../contracts/attachments").AttachmentRequest,
    ): Promise<AttachmentReply> =>
      command.kind === "choose-import"
        ? (choose++, { kind: "unavailable", reason: "source-too-large" })
        : { kind: "attachments", items: [] },
  };
  const props = {
    owner,
    bridge,
    threadId: id,
    editor,
    text: "retained draft",
    isCurrent: () => true,
    onBlocked,
    mention: null,
    dismissMention: () => {},
  };
  const mount = async () =>
    act(async () => {
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: controls(props),
        }),
      );
      await new Promise((r) => setTimeout(r, 25));
    });
  try {
    await mount();
    const attach = Array.from(container.querySelectorAll("button")).find(
      (x) => x.textContent === "Attach files",
    );
    expect(attach).toBeDefined();
    await act(async () => {
      attach!.click();
      await new Promise((r) => setTimeout(r, 25));
    });
    expect(onBlocked).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "25 MiB limit",
    );
    expect(choose).toBe(1);
    expect(editor.getText()).toBe("retained draft");
    await act(() => root.render(null));
    onBlocked.mockClear();
    await mount();
    console.log(
      JSON.stringify({
        afterRemount: {
          blocked: onBlocked.mock.calls.at(-1)?.[0],
          failureVisible:
            container.querySelector('[role="alert"]')?.textContent ?? null,
          chooseRequests: choose,
          text: editor.getText(),
        },
      }),
    );
    expect(onBlocked).toHaveBeenLastCalledWith(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "25 MiB limit",
    );
  } finally {
    await act(() => root.unmount());
    editor.destroy();
    client.clear();
    container.remove();
    vi.unstubAllGlobals();
  }
});

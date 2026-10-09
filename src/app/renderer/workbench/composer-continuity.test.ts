// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { RuntimeViewSchema } from "../../../modules/execution/contracts/public";
import {
  AttachmentSchema,
  DraftSchema,
} from "../../../modules/input/contracts/public";
import { replaceDraftText } from "../../../modules/input/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import type {
  AttachmentBridge,
  AttachmentReply,
} from "../../contracts/attachments";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../contracts/desktop-bridge";
import { AppModel } from "../wiring/model";
import { Composer } from "./composer";

const mounted: {
  root: Root;
  container: HTMLElement;
  model: AppModel;
  client: QueryClient;
}[] = [];
afterEach(async () => {
  for (const { root, container, model, client } of mounted.splice(0)) {
    await act(() => {
      root.unmount();
      model.dispose();
      client.clear();
    });
    container.remove();
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function setup(
  phase?: "interrupted" | "allowed" | "ready" | "browse" | "failed",
  onChooseModel?: () => void,
  attachments?: AttachmentBridge,
  origin?: "cli",
  runtimeBusy = false,
  initialText = "alpha omega",
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: initialText,
    ...(origin ? { origin } : {}),
  });
  const second = DraftSchema.parse({
    ...first,
    threadId: crypto.randomUUID(),
    text: "bravo",
  });
  const drafts = new Map([
    [first.threadId, first],
    [second.threadId, second],
  ]);
  let selected = first.threadId;
  const bridge: DesktopBridge = {
    request: async (command) => {
      if (command.kind === "save") {
        const old = drafts.get(command.threadId);
        if (!old) throw Error("missing saved draft");
        drafts.set(command.threadId, {
          ...old,
          revision: command.expectedRevision + 1,
          text: command.text,
        });
        return parseDesktopReply(command, {
          kind: "saved",
          threadId: command.threadId,
          revision: command.expectedRevision + 1,
        });
      }
      if (command.kind === "select-thread") selected = command.threadId;
      if (command.kind === "restore" || command.kind === "select-thread")
        return parseDesktopReply(command, {
          kind: "ready",
          draft: drafts.get(selected),
          directoryAvailable: true,
          preferences: { theme: "light", density: "normal", locale: "system" },
        });
      throw Error("unexpected command");
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  };
  if (attachments) bridge.attachments = attachments;
  if (phase)
    bridge.runtime = {
      subscribe: () => () => {},
      request: async (command) => ({
        kind: "view",
        view: RuntimeViewSchema.parse({
          threadId: command.threadId,
          traceId: command.traceId,
          revision: 0,
          phase,
          trusted: true,
          busy: runtimeBusy,
          model: null,
          configuration: { code: "runtime.configDefault" },
          message: { code: "runtime.previousSessionReadOnly" },
        }),
      }),
    };
  bridge.submission = {
    subscribe: () => () => {},
    request: async () => ({ kind: "list", receipts: [] }),
  };
  let updateLocale!: (value: {
    preference: "en-US" | "zh-CN";
    resolvedLocale: "en-US" | "zh-CN";
  }) => void;
  const model = new AppModel(bridge);
  await model.start();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  mounted.push({ root, container, model, client });
  function thread() {
    const state = model.getSnapshot();
    if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
      throw Error("missing selected thread");
    return state.threadSelection.thread;
  }
  const render = (
    selectionAttachment?: Parameters<typeof Composer>[0]["selectionAttachment"],
    onAttachmentApplied?: (id: string) => void,
  ) =>
    act(() =>
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: createElement(I18nProvider, {
            bridge: {
              snapshot: async () => ({
                preference: "en-US" as const,
                resolvedLocale: "en-US" as const,
              }),
              subscribe: (listener) => {
                updateLocale = listener;
                return () => {};
              },
              setPreference: async (preference) => ({
                preference,
                resolvedLocale: preference === "system" ? "en-US" : preference,
                persisted: true,
              }),
            },
            initialSnapshot: { preference: "system", resolvedLocale: "en-US" },
            children: createElement(Composer, {
              key: thread().key,
              thread: thread(),
              model,
              onChooseModel,
              ...(selectionAttachment !== undefined
                ? { selectionAttachment }
                : {}),
              ...(onAttachmentApplied ? { onAttachmentApplied } : {}),
            }),
          }),
        }),
      ),
    );
  await render();
  const editor = () => {
    const dom = container.querySelector<HTMLElement & { editor: Editor }>(
      ".tiptap",
    );
    if (!dom) throw Error("missing real editor");
    return dom.editor;
  };
  const select = async (id: typeof first.threadId) => {
    await act(() => model.selectThread(id));
    await render();
  };
  return {
    model,
    bridge,
    first,
    second,
    drafts,
    thread,
    render,
    editor,
    select,
    container,
    changeLocale: () =>
      updateLocale({ preference: "zh-CN", resolvedLocale: "zh-CN" }),
  };
}

it("keeps a frozen selection pending when PM rejects insertion and applies it once after recovery", async () => {
  const fixture = await setup();
  const key = new PluginKey("reject-frozen-context");
  fixture
    .editor()
    .registerPlugin(
      new Plugin({ key, filterTransaction: (tr) => !tr.docChanged }),
    );
  const attachment = {
    id: crypto.randomUUID(),
    threadId: fixture.first.threadId,
    selection: {
      kind: "selection" as const,
      path: "example.ts",
      source: "working-tree",
      version: "fixture-v1",
      text: "const frozen = 1;",
      startLine: 1,
      startColumn: 1,
      endLine: 1,
      endColumn: 18,
    },
  };
  const applied = vi.fn();
  await fixture.render(attachment, applied);
  expect(fixture.editor().getText()).toBe(fixture.first.text);
  expect(applied).not.toHaveBeenCalled();
  fixture.editor().unregisterPlugin(key);
  await fixture.render({ ...attachment }, applied);
  const references: unknown[] = [];
  fixture.editor().state.doc.descendants((node) => {
    if (node.type.name === "fileReference") references.push(node.attrs);
  });
  expect(references).toHaveLength(1);
  expect(references[0]).toMatchObject(attachment.selection);
  expect(applied).toHaveBeenCalledExactlyOnceWith(attachment.id);
  await fixture.render({ ...attachment }, applied);
  expect(applied).toHaveBeenCalledTimes(1);
});

it("preserves A's middle selection and independent undo/redo across A → B → A with fresh views", async () => {
  const fixture = await setup();
  const firstView = fixture.editor().view;
  await act(() => {
    fixture.editor().commands.setTextSelection(6);
    fixture.editor().commands.insertContent(" one");
    fixture.editor().view.dispatch(closeHistory(fixture.editor().state.tr));
    fixture.editor().commands.insertContent(" two");
    fixture.editor().commands.setTextSelection({ from: 3, to: 9 });
  });
  await fixture.select(fixture.second.threadId);
  await act(() => fixture.editor().commands.insertContent(" B"));
  await fixture.select(fixture.first.threadId);
  const restored = fixture.editor();
  expect(restored.view).not.toBe(firstView);
  expect(restored.state.selection.from).toBe(3);
  expect(restored.state.selection.to).toBe(9);
  await act(() => expect(restored.commands.undo()).toBe(true));
  expect(restored.getText()).toBe("alpha one omega");
  expect(restored.state.selection.from).toBe(10);
  await act(() => expect(restored.commands.undo()).toBe(true));
  expect(restored.getText()).toBe("alpha omega");
  expect(restored.state.selection.from).toBe(6);
  await act(() => expect(restored.commands.redo()).toBe(true));
  await act(() => expect(restored.commands.redo()).toBe(true));
  expect(restored.getText()).toBe("alpha one two omega");
  await fixture.select(fixture.second.threadId);
  expect(fixture.editor().getText()).toBe(" Bbravo");
  await act(() => expect(fixture.editor().commands.undo()).toBe(true));
  expect(fixture.editor().getText()).toBe("bravo");
});

it("cannot undo accepted submission consumption in the current editor or after a switch", async () => {
  const fixture = await setup();
  await act(() => fixture.editor().commands.insertContent("sent "));
  const controller = fixture.thread().controller;
  const captured = await act(() =>
    controller.captureSubmission("submission", async () => true),
  );
  if (!captured) throw Error("missing captured draft");
  await act(() =>
    expect(
      controller.consumeSubmission(captured, () =>
        replaceDraftText(fixture.editor(), ""),
      ),
    ).toBe(true),
  );
  expect(fixture.editor().commands.undo()).toBe(false);
  await fixture.select(fixture.second.threadId);
  await fixture.select(fixture.first.threadId);
  expect(fixture.editor().getText()).toBe("");
  expect(fixture.editor().commands.undo()).toBe(false);
});

it("uses an externally updated draft version on return and discards the previous undo", async () => {
  const fixture = await setup();
  await act(() => fixture.editor().commands.insertContent("local "));
  await fixture.select(fixture.second.threadId);
  const old = fixture.drafts.get(fixture.first.threadId);
  if (!old) throw Error("missing old draft");
  fixture.drafts.set(fixture.first.threadId, {
    ...old,
    revision: old.revision + 1,
    text: "external draft",
  });
  await fixture.select(fixture.first.threadId);
  expect(fixture.editor().getText()).toBe("external draft");
  expect(fixture.editor().commands.undo()).toBe(false);
});

it("Shift+Enter inserts a source line in the real composer and remains undoable", async () => {
  const fixture = await setup();
  await act(() => {
    fixture.editor().commands.setTextSelection(6);
    fixture.editor().view.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  expect(fixture.editor().getText({ blockSeparator: "\n" })).toBe(
    "alpha\n omega",
  );
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha\n omega");
  await act(() => expect(fixture.editor().commands.undo()).toBe(true));
  expect(fixture.editor().getText()).toBe("alpha omega");
});

it("offers preparation retry only for an imported CLI chat, without consuming its draft", async () => {
  const fixture = await setup("interrupted", undefined, undefined, "cli");
  const runtime = fixture.thread().runtime!;
  const retry = vi.spyOn(runtime, "act").mockResolvedValue();
  const container = fixture.editor().view.dom.closest("section");
  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === "Retry preparing chat",
  );
  expect(button).toBeDefined();
  await act(() => button?.click());
  expect(retry).toHaveBeenCalledWith("start");
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
});
it("keeps Send and Enter available for idle CLI history, without requiring preparation retry first", async () => {
  const fixture = await setup("interrupted", undefined, undefined, "cli");
  const submission = fixture.thread().submission;
  if (!submission) throw Error("missing submission");
  const send = vi.spyOn(submission, "send").mockResolvedValue();
  const button = fixture.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Send"]',
  );
  expect(button?.disabled).toBe(false);
  await act(() => button?.click());
  expect(send).toHaveBeenCalledOnce();
  send.mockClear();
  await act(() =>
    fixture
      .editor()
      .view.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
  );
  expect(send).toHaveBeenCalledOnce();
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
});

it("does not retry an interrupted chat until its previous process has stopped", async () => {
  const fixture = await setup(
    "interrupted",
    undefined,
    undefined,
    undefined,
    true,
  );
  const retry = vi.spyOn(fixture.thread().runtime!, "act").mockResolvedValue();
  const container = fixture.editor().view.dom.closest("section");
  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === "Retry preparing chat",
  );
  expect(button).toBeUndefined();
  await act(() => button?.click());
  expect(retry).not.toHaveBeenCalled();
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
});

it("explains a running session without a model and offers model selection without consuming its draft", async () => {
  const choose = vi.fn();
  const fixture = await setup("ready", choose);
  const container = fixture.editor().view.dom.closest("section");
  expect(container?.textContent).toContain("No active model");
  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === "Select model",
  );
  expect(button).toBeDefined();
  await act(() => button?.click());
  expect(choose).toHaveBeenCalledOnce();
  await act(() =>
    fixture.editor().view.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
});

it.each(["file-picker", "drop"])(
  "keeps a pending %s insertion in its real Composer before admitting the developer view",
  async (source) => {
    let complete!: (reply: AttachmentReply) => void;
    let items: import("../../../modules/input/contracts/public").Attachment[] =
      [];
    const request: AttachmentBridge["request"] = async (command) => {
      if (command.kind === "choose-import" || command.kind === "import-bytes")
        return new Promise((resolve) => {
          complete = resolve;
        });
      if (command.kind === "history-open")
        return {
          kind: "history-lease",
          leaseId: crypto.randomUUID(),
          version: 0,
        };
      if (command.kind === "history-update")
        return {
          kind: "history-lease",
          leaseId: command.leaseId,
          version: command.version,
        };
      if (command.kind === "history-release")
        return { kind: "history-released" };
      if (command.kind === "import-settle") return { kind: "import-settled" };
      return { kind: "attachments", items };
    };
    const fixture = await setup(undefined, undefined, { request });
    const attach = Array.from(
      fixture.container.querySelectorAll("button"),
    ).find((button) => button.getAttribute("aria-label") === "Attach files");
    if (!attach) throw Error("missing real attachment control");
    let admitted = true;
    await act(async () => {
      if (source === "file-picker") attach.click();
      else {
        const event = new DragEvent("drop", {
          bubbles: true,
          cancelable: true,
        });
        Object.defineProperty(event, "dataTransfer", {
          value: {
            files: [new File(["text"], "pending.txt", { type: "text/plain" })],
          },
        });
        const view = fixture.editor().view;
        view.someProp("handleDrop", (handle) =>
          handle(view, event, Slice.empty, false),
        );
      }
      // Same event turn: do not depend on React's pending-state effect having run.
      admitted = await fixture.model.prepareViewNavigation();
    });
    expect(admitted).toBe(false);
    expect(fixture.editor().isEditable).toBe(true);
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
    const id = crypto.randomUUID();
    items = [
      AttachmentSchema.parse({
        schemaVersion: 1,
        id,
        token: `[[dpi-attachment:${id}]]`,
        threadId: fixture.first.threadId,
        name: "pending.txt",
        mimeType: "text/plain",
        byteLength: 4,
        capturedAt: new Date().toISOString(),
        source: "file",
        status: "ready",
        representation: "text",
        coverageGaps: [],
        textOnly: true,
      }),
    ];
    await act(async () => {
      complete({ kind: "attachments", items });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fixture.thread().controller.getTextSnapshot()).toContain(
      items[0]?.token,
    );
    await act(async () =>
      expect(await fixture.model.prepareViewNavigation()).toBe(true),
    );
    expect(fixture.model.controller).toBe(fixture.thread().controller);
  },
);

it.each(["limit", "failure"] as const)(
  "makes history protection %s observable in the real Composer while preserving its source body",
  async (mode) => {
    let items: import("../../../modules/input/contracts/public").Attachment[] =
      [];
    let failure = mode === "failure";
    const bridge: AttachmentBridge = {
      request: async (command) => {
        if (command.kind === "history-open")
          return {
            kind: "history-lease",
            leaseId: crypto.randomUUID(),
            version: 0,
          };
        if (command.kind === "history-update")
          return mode === "limit"
            ? { kind: "history-limit" }
            : failure
              ? { kind: "unavailable", reason: "storage-unavailable" }
              : {
                  kind: "history-lease",
                  leaseId: command.leaseId,
                  version: command.version,
                };
        if (command.kind === "history-release")
          return { kind: "history-released" };
        return { kind: "attachments", items };
      },
    };
    const fixture = await setup(undefined, undefined, bridge);
    const id = crypto.randomUUID();
    const item = AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      token: `[[dpi-attachment:${id}]]`,
      threadId: fixture.first.threadId,
      name: "original.txt",
      mimeType: "text/plain",
      byteLength: 4,
      capturedAt: new Date().toISOString(),
      source: "paste",
      status: "ready",
      representation: "text",
      coverageGaps: [],
      textOnly: true,
    });
    items = [item];
    const button = Array.from(
      fixture.container.querySelectorAll("button"),
    ).find((button) => button.getAttribute("aria-label") === "Attach files");
    if (!button) throw Error("missing attach action");
    await act(async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(fixture.editor().getText()).toContain(item.token);
    if (mode === "limit") {
      expect(fixture.container.textContent).toContain(
        "Undo history was cleared; your draft is preserved",
      );
      expect(fixture.editor().can().undo()).toBe(false);
      await act(async () =>
        expect(await fixture.thread().controller.flush()).toBe(true),
      );
    } else {
      await act(async () =>
        expect(await fixture.thread().controller.flush()).toBe(false),
      );
      expect(fixture.thread().controller.getSnapshot()).toMatchObject({
        kind: "failed",
        error: {
          recovery: "retry_safe",
          message: { code: "attachment.historyLeaseFailed" },
        },
      });
      expect(fixture.editor().can().undo()).toBe(true);
      expect(fixture.container.textContent).toContain("Retry asset protection");
      failure = false;
      await act(async () =>
        expect(await fixture.thread().controller.retry()).toBe(true),
      );
    }
    expect(fixture.thread().controller.getTextSnapshot()).toContain(item.token);
  },
);

it("keeps publication-limit Undo until explicit recovery and waits for Main lease release before retry", async () => {
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  let finishRelease: () => void = () => {};
  const release = new Promise<void>((resolve) => {
    finishRelease = resolve;
  });
  let released = false,
    retries = 0;
  const bridge: AttachmentBridge = {
    request: async (command) => {
      if (command.kind === "history-open")
        return {
          kind: "history-lease",
          leaseId: crypto.randomUUID(),
          version: 0,
        };
      if (command.kind === "history-update")
        return {
          kind: "history-lease",
          leaseId: command.leaseId,
          version: command.version,
        };
      if (command.kind === "history-release") {
        await release;
        released = true;
        return { kind: "history-released" };
      }
      if (command.kind === "preview")
        return { kind: "unavailable", reason: "pdf-conversion-failed" };
      if (command.kind === "retry") {
        retries++;
        if (!released)
          return { kind: "unavailable", reason: "editor-history-limit" };
        items = items.map((item) => {
          const updated = { ...item, status: "ready" as const };
          delete updated.reason;
          return updated;
        });
      }
      return { kind: "attachments", items };
    },
  };
  const fixture = await setup(undefined, undefined, bridge);
  const id = crypto.randomUUID();
  items = [
    AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      threadId: fixture.first.threadId,
      token: `[[dpi-attachment:${id}]]`,
      name: "retry.pdf",
      mimeType: "application/pdf",
      byteLength: 4,
      capturedAt: new Date().toISOString(),
      source: "paste",
      status: "failed",
      reason: "pdf-conversion-failed",
      representation: "pdf-text",
      coverageGaps: [],
      textOnly: false,
    }),
  ];
  const button = (label: string) =>
    Array.from(fixture.container.querySelectorAll("button")).find(
      (button) =>
        (button.getAttribute("aria-label") ?? button.textContent) === label,
    );
  await act(async () => {
    button("Attach files")?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    await fixture.thread().controller.flush();
  });
  const body = fixture.editor().getText();
  expect(fixture.editor().can().undo()).toBe(true);
  await act(async () => {
    const token = fixture
      .editor()
      .view.dom.querySelector<HTMLElement>("[data-attachment-id]");
    if (!token) throw Error("missing inline failed file");
    fixture.editor().commands.setNodeSelection(1);
    fixture
      .editor()
      .view.someProp("handleKeyDown", (handler) =>
        handler(
          fixture.editor().view,
          new KeyboardEvent("keydown", { key: "Enter" }),
        ),
      );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  await act(async () => {
    button("Retry preparation")?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(retries).toBe(1);
  expect(fixture.container.textContent).toContain(
    "The saved attachment and undo history are preserved",
  );
  expect(fixture.editor().can().undo()).toBe(true);
  expect(fixture.editor().getText()).toBe(body);
  const recover = button("Clear undo history and retry");
  expect(recover).toBeDefined();
  await act(async () => {
    recover?.click();
    await Promise.resolve();
  });
  expect(fixture.editor().can().undo()).toBe(false);
  expect(fixture.editor().getText()).toBe(body);
  expect(retries).toBe(1);
  await act(async () => {
    finishRelease();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(retries).toBe(2);
  expect(released).toBe(true);
  expect(fixture.editor().getText()).toBe(body);
});

it("connects synchronous copy and awaited structured paste in real Composer views as one user action", async () => {
  const snapshots = new Map<string, string>();
  let completeExport!: () => void;
  const ready = new Promise<void>((resolve) => {
    completeExport = resolve;
  });
  const bridge: AttachmentBridge = {
    request: async (command) => {
      if (command.kind === "clipboard-reserve")
        return {
          kind: "clipboard-tickets",
          tickets: Array.from({ length: 2 }, () => ({
            version: 1,
            instanceId: crypto.randomUUID(),
            handleId: crypto.randomUUID(),
            expiresAt: Date.now() + 10000,
          })),
        };
      if (command.kind === "clipboard-export") {
        snapshots.set(command.ticket.handleId, command.text);
        await ready;
        return { kind: "clipboard-exported", degraded: false };
      }
      if (command.kind === "clipboard-import") {
        await ready;
        return {
          kind: "clipboard-imported",
          text: snapshots.get(command.ticket.handleId) ?? "",
          items: [],
          degraded: false,
        };
      }
      return { kind: "attachments", items: [] };
    },
  };
  const fixture = await setup(undefined, undefined, bridge);
  const formats = new Map<string, string>();
  const event = {
    clipboardData: {
      types: ["text/plain", "application/x-dpi-context-fragment+json"],
      files: [],
      setData: (type: string, value: string) => formats.set(type, value),
      getData: (type: string) => formats.get(type) ?? "",
    },
    preventDefault() {},
  } as unknown as ClipboardEvent;
  await act(() => {
    fixture.editor().commands.selectAll();
    const handle = fixture.editor().options.editorProps?.handleDOMEvents?.copy;
    expect(handle?.(fixture.editor().view, event)).toBe(true);
  });
  expect(formats.get("application/x-dpi-context-fragment+json")).toContain(
    "handleId",
  );
  await fixture.select(fixture.second.threadId);
  await act(() => {
    const handler = fixture.editor().options.editorProps?.handlePaste;
    expect(
      handler?.(
        fixture.editor().view,
        event,
        new Slice(fixture.editor().state.doc.content, 0, 0),
      ),
    ).toBe(true);
  });
  expect(fixture.thread().attachments?.stateStore.getState().pending).toBe(1);
  await act(async () => {
    completeExport();
    await ready;
  });
  expect(fixture.editor().getText()).toBe("alpha omegabravo");
  expect(fixture.thread().attachments?.stateStore.getState().pending).toBe(0);
  await act(() => {
    expect(fixture.editor().commands.undo()).toBe(true);
  });
  expect(fixture.editor().getText()).toBe("bravo");
});

it("shows automatic preparation without asking the user to start OMP", async () => {
  const fixture = await setup("allowed");
  const labels = Array.from(fixture.container.querySelectorAll("button")).map(
    (button) => button.textContent,
  );
  expect(labels).not.toContain("Start OMP");
  expect(fixture.container.textContent).not.toContain("Preparing this chat");
  expect(
    fixture.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Send"]',
    )?.disabled,
  ).toBe(true);
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
});

it("offers an explicit startup retry after failure and preserves the draft until a real submission", async () => {
  const fixture = await setup("failed");
  const button = Array.from(fixture.container.querySelectorAll("button")).find(
    (button) => button.textContent === "Retry",
  );
  expect(button).toBeDefined();
  const runtime = fixture.thread().runtime;
  if (!runtime) throw Error("missing Runtime");
  const retry = vi.spyOn(runtime, "act").mockResolvedValue();
  await act(() => button?.click());
  expect(retry).toHaveBeenCalledExactlyOnceWith("start");
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
});

it("offers the normal project trust action for a CLI session and retains the question draft", async () => {
  const fixture = await setup("browse", undefined, undefined, "cli");
  const labels = Array.from(fixture.container.querySelectorAll("button")).map(
    (button) => button.textContent,
  );
  expect(labels).toContain("Allow execution and start");
  expect(labels).not.toContain("Start OMP");
  expect(fixture.container.textContent).not.toContain("CLI");
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
});

it("owns Enter while the reference popup is loading, empty or dismissed, and leaves IME confirmation to the editor", async () => {
  let finishSearch!: (reply: AttachmentReply) => void;
  const fixture = await setup("ready", undefined, {
    request: async (command) => {
      if (command.kind === "search-reference")
        return new Promise((resolve) => {
          finishSearch = resolve;
        });
      return { kind: "attachments", items: [] };
    },
  });
  const editor = fixture.editor();
  vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({
    left: 20,
    right: 20,
    top: 200,
    bottom: 220,
  });
  await act(() => replaceDraftText(editor, "@missing"));
  await act(() => new Promise((resolve) => setTimeout(resolve, 180)));
  const key = async (value: string, keyCode = 0, repeat = false) => {
    const event = new KeyboardEvent("keydown", {
      key: value,
      keyCode,
      repeat,
      cancelable: true,
    });
    let handled = false;
    await act(() => {
      handled =
        editor.options.editorProps?.handleKeyDown?.(editor.view, event) ===
        true;
    });
    return { handled, prevented: event.defaultPrevented };
  };
  expect(await key("Enter")).toEqual({ handled: true, prevented: true });
  expect(await key("Enter", 229)).toEqual({ handled: false, prevented: false });
  await act(() =>
    finishSearch({ kind: "search", entries: [], truncated: false }),
  );
  expect(await key("Enter")).toEqual({ handled: true, prevented: true });
  expect(await key("Escape")).toEqual({ handled: true, prevented: true });
  await act(() => editor.commands.insertContent("x"));
  expect(fixture.container.querySelector('[role="listbox"]')).toBeNull();
  expect(editor.getText()).toBe("@missingx");
});

it("accepts one reference on Enter and preserves input typed while Main verifies the chosen source", async () => {
  let finishReference!: (reply: AttachmentReply) => void;
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const choose = vi.fn();
  const fixture = await setup(undefined, undefined, {
    request: async (command) => {
      if (command.kind === "search-reference")
        return {
          kind: "search",
          entries: [{ path: "src/beta.ts", kind: "file", name: "beta.ts" }],
          truncated: false,
        };
      if (command.kind === "add-reference") {
        choose();
        return new Promise((resolve) => {
          finishReference = resolve;
        });
      }
      if (command.kind === "history-open")
        return {
          kind: "history-lease",
          leaseId: crypto.randomUUID(),
          version: 0,
        };
      if (command.kind === "history-update")
        return {
          kind: "history-lease",
          leaseId: command.leaseId,
          version: command.version,
        };
      if (command.kind === "history-release")
        return { kind: "history-released" };
      return { kind: "attachments", items };
    },
  });
  const editor = fixture.editor();
  vi.spyOn(editor.view, "coordsAtPos").mockReturnValue({
    left: 20,
    right: 20,
    top: 200,
    bottom: 220,
  });
  await act(() => replaceDraftText(editor, "@src/"));
  await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(fixture.container.querySelectorAll('[role="option"]')).toHaveLength(1);
  await act(() => {
    const handler = editor.options.editorProps?.handleKeyDown;
    handler?.(
      editor.view,
      new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
    );
    handler?.(
      editor.view,
      new KeyboardEvent("keydown", {
        key: "Enter",
        repeat: true,
        cancelable: true,
      }),
    );
    editor.commands.insertContent(" B");
  });
  expect(choose).toHaveBeenCalledTimes(1);
  const id = crypto.randomUUID();
  items = [
    AttachmentSchema.parse({
      schemaVersion: 1,
      id,
      token: `[[dpi-attachment:${id}]]`,
      threadId: fixture.first.threadId,
      name: "beta.ts",
      mimeType: "text/plain",
      byteLength: 1,
      capturedAt: new Date().toISOString(),
      source: "reference",
      status: "ready",
      representation: "reference",
      coverageGaps: [],
      textOnly: false,
      referenceKind: "file",
      path: "src/beta.ts",
    }),
  ];
  await act(() => finishReference({ kind: "attachments", items }));
  expect(fixture.thread().controller.getTextSnapshot()).toBe(
    `${items[0]?.token} B`,
  );
  await act(() => editor.commands.undo());
  expect(editor.getText()).toBe("@src/ B");
});

function importedText(threadId: string, name: string) {
  const id = crypto.randomUUID();
  return AttachmentSchema.parse({
    schemaVersion: 1,
    id,
    token: `[[dpi-attachment:${id}]]`,
    threadId,
    name,
    mimeType: "text/plain",
    byteLength: 4,
    capturedAt: new Date().toISOString(),
    source: "paste",
    status: "ready",
    representation: "text",
    coverageGaps: [],
    textOnly: false,
  });
}
function historyReply(
  command: Parameters<AttachmentBridge["request"]>[0],
): AttachmentReply | null {
  if (command.kind === "history-open")
    return { kind: "history-lease", leaseId: crypto.randomUUID(), version: 0 };
  if (command.kind === "history-update")
    return {
      kind: "history-lease",
      leaseId: command.leaseId,
      version: command.version,
    };
  if (command.kind === "history-release") return { kind: "history-released" };
  if (command.kind === "import-settle") return { kind: "import-settled" };
  return null;
}
async function pasteFiles(
  fixture: Awaited<ReturnType<typeof setup>>,
  files: File[],
  text = "",
) {
  const event = {
    clipboardData: {
      files,
      types: ["text/plain"],
      getData: (format: string) => (format === "text/plain" ? text : ""),
    },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
  await act(() => {
    const editor = fixture.editor();
    editor.options.editorProps?.handlePaste?.(editor.view, event, Slice.empty);
  });
}

it("inserts mixed-paste files at the captured source boundary and undoes the whole batch without erasing later typing", async () => {
  let finish!: (reply: AttachmentReply) => void;
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const fixture = await setup(undefined, undefined, {
    request: async (command) => {
      if (command.kind === "import-bytes")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return historyReply(command) ?? { kind: "attachments", items };
    },
  });
  await act(() => fixture.editor().commands.setTextSelection(6));
  await pasteFiles(fixture, [new File(["file"], "source.txt")], " A");
  await act(() => fixture.editor().commands.insertContent(" B"));
  await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha A B omega");
  items = [importedText(fixture.first.threadId, "source.txt")];
  await act(() => finish({ kind: "attachments", items }));
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  expect(fixture.thread().controller.getTextSnapshot()).toBe(
    `alpha A${items[0]?.token} B omega`,
  );
  expect(
    fixture.editor().view.dom.querySelector(".composer-context-token")
      ?.textContent,
  ).toContain("source.txt");
  expect(
    fixture
      .editor()
      .view.dom.querySelector<HTMLElement>('[data-context-kind="external"]')
      ?.hidden,
  ).toBe(false);
  expect(fixture.container.querySelector("details")).toBeNull();
  await act(() => fixture.editor().commands.undo());
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha A B omega");
  expect(fixture.container.querySelector(".attachment-rail")).toBeNull();
  await act(() => fixture.editor().commands.redo());
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(
    fixture.editor().view.dom.querySelector(".composer-context-token")
      ?.textContent,
  ).toContain("source.txt");
  expect(
    fixture
      .editor()
      .view.dom.querySelector<HTMLElement>('[data-context-kind="external"]')
      ?.hidden,
  ).toBe(false);
});

it("renders images only as tiles and MIME files only inline, without a repeated failure panel or image Undo", async () => {
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const fixture = await setup(undefined, undefined, {
    request: async (command) => {
      if (command.kind === "preview")
        return { kind: "unavailable", reason: "unsupported-format" };
      return historyReply(command) ?? { kind: "attachments", items };
    },
  });
  const imageId = crypto.randomUUID(),
    fileId = crypto.randomUUID();
  const base = {
    schemaVersion: 1,
    threadId: fixture.first.threadId,
    byteLength: 1024,
    capturedAt: new Date().toISOString(),
    source: "file",
    coverageGaps: [],
    textOnly: false,
  };
  const image = AttachmentSchema.parse({
    ...base,
    id: imageId,
    token: `[[dpi-attachment:${imageId}]]`,
    name: "image.png",
    mimeType: "image/png",
    status: "ready",
    representation: "image",
    inputDigest: "a".repeat(64),
  });
  const file = AttachmentSchema.parse({
    ...base,
    id: fileId,
    token: `[[dpi-attachment:${fileId}]]`,
    name: "report.docx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    status: "failed",
    reason: "unsupported-format",
    representation: "unsupported",
    inputDigest: "b".repeat(64),
  });
  items = [image, file];
  const attach = fixture.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Attach files"]',
  );
  await act(async () => {
    attach?.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(fixture.editor().getText()).toContain(file.token);
  expect(fixture.editor().getText()).not.toContain(image.token);
  expect(
    fixture.container.querySelector(".attachment-rail")?.textContent,
  ).not.toContain(file.name);
  const token = fixture
    .editor()
    .view.dom.querySelector('[data-file-kind="document"]');
  expect(token?.textContent).toContain("1 KB");
  expect(token?.getAttribute("data-status")).toBe("failed");
  expect(fixture.container.querySelector(".composer-notice")).toBeNull();
  expect(
    fixture.container.querySelector(".composer-context")?.textContent,
  ).not.toContain("This file format");
  await act(() => fixture.editor().commands.undo());
  expect(fixture.thread().controller.getTextSnapshot()).not.toContain(
    file.token,
  );
  expect(fixture.thread().controller.getTextSnapshot()).toContain(image.token);
  await act(() =>
    fixture.container
      .querySelector<HTMLButtonElement>('button[aria-label="Remove image.png"]')
      ?.click(),
  );
  await act(() => fixture.editor().commands.redo());
  expect(fixture.thread().controller.getTextSnapshot()).toContain(file.token);
  expect(fixture.thread().controller.getTextSnapshot()).not.toContain(
    image.token,
  );
  expect(fixture.container.querySelector(".attachment-rail")).toBeNull();
});

it("exposes partial import without automatic adoption and accepts the ready subset only through its explicit Composer action", async () => {
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const fixture = await setup(undefined, undefined, {
    request: async (command) => {
      if (command.kind === "import-bytes") {
        if (command.name === "bad.txt")
          return { kind: "unavailable", reason: "unsupported-format" };
        const item = importedText(command.threadId, command.name);
        items = [item];
        return { kind: "attachments", items: [item] };
      }
      return historyReply(command) ?? { kind: "attachments", items };
    },
  });
  await pasteFiles(fixture, [
    new File(["file"], "good.txt"),
    new File(["file"], "bad.txt"),
  ]);
  await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
  expect(fixture.thread().canPrepareInput()).toBe(false);
  const accept = Array.from(fixture.container.querySelectorAll("button")).find(
    (button) => button.textContent === "Insert only ready files",
  );
  expect(accept).toBeDefined();
  accept?.focus();
  await act(() => accept?.click());
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(fixture.thread().controller.getTextSnapshot()).toContain(
    items[0]?.token,
  );
  expect(document.activeElement).toBe(fixture.editor().view.dom);
  expect(fixture.thread().canPrepareInput()).toBe(false);
  const report = fixture.container.querySelector('[aria-label="File import"]');
  expect(report?.textContent).toContain("bad.txt");
  expect(report?.textContent).not.toContain(items[0]?.name);
  const discard = Array.from(fixture.container.querySelectorAll("button")).find(
    (button) => button.getAttribute("aria-label") === "Cancel bad.txt",
  );
  expect(discard).toBeDefined();
  await act(() => discard?.click());
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  expect(fixture.thread().attachmentImports?.stateStore.getState().ready).toBe(
    true,
  );
  expect(
    fixture.container.querySelector('[aria-label="File import"]'),
  ).toBeNull();
});

it("previews and confirms a failed PDF in its original import job before explicit insertion", async () => {
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const request = vi.fn(
    async (
      command: Parameters<AttachmentBridge["request"]>[0],
    ): Promise<AttachmentReply> => {
      if (command.kind === "import-bytes") {
        items = [
          AttachmentSchema.parse({
            ...importedText(command.threadId, command.name),
            mimeType: "application/pdf",
            status: "failed",
            reason: "pdf-coverage-gap",
            representation: "pdf-text",
            coverageGaps: ["page-1"],
          }),
        ];
        return { kind: "attachments", items };
      }
      if (command.kind === "set-text-only") {
        expect(command.id).toBe(items[0]?.id);
        items = items.map((item) =>
          AttachmentSchema.parse({
            ...item,
            status: "ready",
            reason: undefined,
            textOnly: true,
          }),
        );
        return { kind: "attachments", items };
      }
      if (command.kind === "preview")
        return { kind: "text", text: "Extracted PDF text", truncated: false };
      return historyReply(command) ?? { kind: "attachments", items };
    },
  );
  const fixture = await setup(undefined, undefined, { request });
  await pasteFiles(fixture, [
    new File(["PDF"], "scan.pdf", { type: "application/pdf" }),
  ]);
  await act(() => new Promise((resolve) => setTimeout(resolve, 80)));
  expect(
    fixture.thread().attachmentImports?.stateStore.getState().batches[0]
      ?.jobs[0]?.reason,
  ).toBe("pdf-coverage-gap");
  const button = (text: string) =>
    Array.from(fixture.container.querySelectorAll("button")).find(
      (entry) => entry.textContent === text,
    );
  expect(button("Use extracted text only")).toBeDefined();
  const preview = Array.from(fixture.container.querySelectorAll("button")).find(
    (entry) => entry.getAttribute("aria-label") === "Preview scan.pdf",
  );
  expect(preview).toBeDefined();
  await act(() => preview?.click());
  expect(
    request.mock.calls.some(
      ([command]) => command.kind === "preview" && command.id === items[0]?.id,
    ),
  ).toBe(true);
  const close = fixture.container.querySelector<HTMLButtonElement>(
    '[aria-label="Close preview"]',
  );
  await act(() => close?.click());
  await act(() => button("Use extracted text only")?.click());
  expect(fixture.thread().controller.getTextSnapshot()).toBe("alpha omega");
  expect(items[0]?.textOnly).toBe(true);
  expect(button("Insert ready files at cursor")).toBeDefined();
  await act(() => button("Insert ready files at cursor")?.click());
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(fixture.thread().controller.getTextSnapshot()).toContain(
    items[0]?.token,
  );
  expect(
    request.mock.calls.filter(([command]) => command.kind === "import-bytes"),
  ).toHaveLength(1);
  expect(fixture.thread().attachmentImports?.stateStore.getState().ready).toBe(
    true,
  );
});
it("returns the mapped caret to the real editor when expanding and collapsing for continued input", async () => {
  const fixture = await setup();
  const editor = fixture.editor();
  await act(() => editor.commands.setTextSelection(6));
  const button = fixture.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Expand editor"]',
  );
  expect(button).not.toBeNull();
  await act(() => {
    button?.focus();
    button?.click();
  });
  expect(document.activeElement).toBe(editor.view.dom);
  expect(editor.state.selection.from).toBe(6);
  await act(() => editor.commands.insertContent(" typing"));
  expect(editor.getText()).toBe("alpha typing omega");
  const collapse = fixture.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Collapse editor"]',
  );
  await act(() => {
    collapse?.focus();
    collapse?.click();
  });
  expect(document.activeElement).toBe(editor.view.dom);
});

it("preserves the mixed-paste target when only localized labels change", async () => {
  let finish!: (reply: AttachmentReply) => void;
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const fixture = await setup(undefined, undefined, {
    request: async (command) => {
      if (command.kind === "import-bytes")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return historyReply(command) ?? { kind: "attachments", items };
    },
  });
  await act(() => fixture.editor().commands.setTextSelection(6));
  await pasteFiles(fixture, [new File(["file"], "source.txt")], " A");
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  await act(() => fixture.changeLocale());
  items = [importedText(fixture.first.threadId, "source.txt")];
  await act(() => finish({ kind: "attachments", items }));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(fixture.thread().controller.getTextSnapshot()).toBe(
    `alpha A${items[0]?.token} omega`,
  );
});

it("returns focus after explicitly adopting a pending image", async () => {
  let finish!: (reply: AttachmentReply) => void;
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const fixture = await setup(undefined, undefined, {
    request: async (command) => {
      if (command.kind === "choose-import")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return historyReply(command) ?? { kind: "attachments", items };
    },
  });
  const attach = fixture.container.querySelector<HTMLButtonElement>(
    'button[aria-label="Attach files"]',
  );
  await act(() => attach?.click());
  await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
  const image = AttachmentSchema.parse({
    ...importedText(fixture.first.threadId, "image.png"),
    mimeType: "image/png",
    representation: "image",
    inputDigest: "a".repeat(64),
  });
  items = [image];
  const composing = vi
    .spyOn(fixture.editor().view, "composing", "get")
    .mockReturnValue(true);
  await act(() => finish({ kind: "attachments", items }));
  let insert: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    insert = Array.from(fixture.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Add to draft",
    );
    expect(insert).toBeDefined();
  });
  if (!insert) throw Error("missing pending image button");
  await act(() => {
    composing.mockReturnValue(false);
    insert?.focus();
    insert?.click();
  });
  expect(fixture.thread().controller.getTextSnapshot()).toContain(image.token);
  expect(fixture.editor().getText()).toBe("alpha omega");
  expect(document.activeElement).toBe(fixture.editor().view.dom);
});

it("keeps a restored image when the real Composer body is replaced before list metadata arrives", async () => {
  const imageId = crypto.randomUUID();
  const token = `[[dpi-attachment:${imageId}]]`;
  let completeList!: (reply: AttachmentReply) => void;
  const fixture = await setup(
    undefined,
    undefined,
    {
      request: async (command) => {
        if (command.kind === "list")
          return new Promise((resolve) => {
            completeList = resolve;
          });
        return historyReply(command) ?? { kind: "attachments", items: [] };
      },
    },
    undefined,
    false,
    `body${token}`,
  );
  expect(completeList).toBeTypeOf("function");
  const image = AttachmentSchema.parse({
    schemaVersion: 1,
    id: imageId,
    threadId: fixture.first.threadId,
    token,
    name: "cold.png",
    mimeType: "image/png",
    byteLength: 4,
    capturedAt: new Date().toISOString(),
    source: "file",
    status: "ready",
    representation: "image",
    inputDigest: "a".repeat(64),
    coverageGaps: [],
    textOnly: false,
  });
  expect(fixture.editor().view.editable).toBe(false);
  await act(() => {
    fixture.editor().commands.selectAll();
    fixture.editor().commands.insertContent("replacement body");
  });
  expect(fixture.thread().controller.getTextSnapshot()).toContain(token);
  await act(() => completeList({ kind: "attachments", items: [image] }));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(fixture.editor().view.editable).toBe(true);
  await act(() => {
    fixture.editor().commands.selectAll();
    fixture.editor().commands.insertContent("replacement body");
  });
  expect(fixture.editor().getText()).toBe("replacement body");
  expect(fixture.thread().controller.getTextSnapshot()).toContain(token);
  expect(
    fixture.container.querySelector(".attachment-rail")?.textContent,
  ).toContain("cold.png");
});
it("offers explicit metadata retry while keeping an unresolved restored image protected", async () => {
  const id = crypto.randomUUID(),
    token = `[[dpi-attachment:${id}]]`;
  let attempts = 0;
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const fixture = await setup(
    undefined,
    undefined,
    {
      request: async (command) => {
        if (command.kind === "list")
          return ++attempts === 1
            ? { kind: "unavailable", reason: "storage-unavailable" }
            : { kind: "attachments", items };
        return historyReply(command) ?? { kind: "attachments", items };
      },
    },
    undefined,
    false,
    `body${token}`,
  );
  const image = AttachmentSchema.parse({
    ...importedText(fixture.first.threadId, "cold.png"),
    id,
    token,
    mimeType: "image/png",
    representation: "image",
    inputDigest: "a".repeat(64),
  });
  items = [image];
  let retry: HTMLButtonElement | undefined;
  await vi.waitFor(() => {
    retry = Array.from(fixture.container.querySelectorAll("button")).find(
      (button) => button.textContent === "Reload attachments",
    );
    expect(retry).toBeDefined();
  });
  expect(fixture.editor().view.editable).toBe(false);
  expect(fixture.thread().controller.getTextSnapshot()).toContain(token);
  await act(() => retry?.click());
  await vi.waitFor(() => expect(fixture.editor().view.editable).toBe(true));
  expect(fixture.editor().getText()).toBe("body");
  expect(fixture.thread().controller.getTextSnapshot()).toContain(token);
});

it("saves edits quietly without adding a pending status row, and keeps real save recovery", async () => {
  const fixture = await setup();
  await act(() => fixture.editor().commands.insertContent(" more"));
  expect(fixture.thread().controller.getSnapshot().kind).toBe("dirty");
  expect(fixture.container.querySelector(".save-status")).toBeNull();
  const originalRequest = fixture.bridge.request;
  const request = vi.spyOn(fixture.bridge, "request");
  let finishSave!: () => void;
  request.mockImplementationOnce(
    (command) =>
      new Promise((resolve) => {
        finishSave = () => {
          void originalRequest(command).then(resolve);
        };
      }),
  );
  let saving!: Promise<boolean>;
  await act(() => {
    saving = fixture.thread().controller.flush();
  });
  expect(fixture.thread().controller.getSnapshot().kind).toBe("saving");
  expect(fixture.container.querySelector(".save-status")).toBeNull();
  await act(async () => {
    finishSave();
    await saving;
  });
  expect(fixture.drafts.get(fixture.first.threadId)?.text).toContain("more");
  request.mockRejectedValueOnce(Error("save transport lost"));
  await act(() => fixture.editor().commands.insertContent(" recover"));
  await act(() => fixture.thread().controller.flush());
  expect(fixture.thread().controller.getSnapshot().kind).toBe("failed");
  expect(fixture.container.querySelector('[role="alert"]')).not.toBeNull();
  const check = Array.from(fixture.container.querySelectorAll("button")).find(
    (b) => b.textContent === "Check save status",
  );
  expect(check).toBeDefined();
  expect(fixture.editor().getText()).toContain("recover");
  let finishCheck!: () => void;
  request.mockImplementationOnce(
    (command) =>
      new Promise((resolve) => {
        finishCheck = () => {
          void originalRequest(command).then(resolve);
        };
      }),
  );
  await act(() => check?.click());
  expect(fixture.thread().controller.getSnapshot().kind).toBe("checking");
  expect(fixture.container.querySelector(".save-status")).toBeNull();
  await act(async () => {
    finishCheck();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(fixture.thread().controller.getSnapshot().kind).toBe("saved");
  expect(fixture.drafts.get(fixture.first.threadId)?.text).toContain("recover");
});

it("removes successful import reports without losing image adoption, dedup settlement or Undo/Redo", async () => {
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const request = vi.fn(
    async (
      command: Parameters<AttachmentBridge["request"]>[0],
    ): Promise<AttachmentReply> => {
      if (command.kind === "import-bytes") {
        const next = AttachmentSchema.parse({
          ...importedText(command.threadId, command.name),
          mimeType: "image/png",
          representation: "image",
          inputDigest: "b".repeat(64),
        });
        items.push(next);
        return { kind: "attachments", items: [next] };
      }
      if (command.kind === "preview")
        return {
          kind: "image",
          dataUrl: "data:image/png;base64,aA==",
        };
      return historyReply(command) ?? { kind: "attachments", items };
    },
  );
  const fixture = await setup(undefined, undefined, { request });
  const imports = fixture.thread().attachmentImports!;
  const file = new File(["image"], "photo.png", { type: "image/png" });
  await pasteFiles(fixture, [file]);
  await act(() =>
    vi.waitFor(() => expect(imports.stateStore.getState().ready).toBe(true)),
  );
  expect(fixture.thread().controller.getAttachmentIds()).toHaveLength(1);
  expect(
    fixture.container.querySelector('[aria-label="File import"]'),
  ).toBeNull();
  await pasteFiles(fixture, [file]);
  await act(() =>
    vi.waitFor(() => expect(imports.stateStore.getState().ready).toBe(true)),
  );
  expect(fixture.thread().controller.getAttachmentIds()).toHaveLength(1);
  expect(
    request.mock.calls
      .filter(([c]) => c.kind === "import-settle")
      .map(([c]) => (c.kind === "import-settle" ? c.disposition : "")),
  ).toEqual(["adopt", "release"]);
  await act(() =>
    fixture.container
      .querySelector<HTMLButtonElement>('[aria-label="Remove photo.png"]')
      ?.click(),
  );
  expect(fixture.thread().controller.getAttachmentIds()).toEqual([]);
  expect(
    fixture.container.querySelector('[aria-label="Preview photo.png"]'),
  ).toBeNull();
  expect(fixture.container.textContent).not.toContain("Inserted");
  expect(fixture.container.textContent).not.toContain("Dismiss import results");
  await act(() => fixture.editor().commands.insertContent(" new"));
  await act(() => fixture.editor().commands.undo());
  await act(() => fixture.editor().commands.redo());
  expect(fixture.thread().controller.getAttachmentIds()).toEqual([]);
  await fixture.select(fixture.second.threadId);
  expect(
    fixture.container.querySelector('[aria-label="File import"]'),
  ).toBeNull();
});

it("keeps failed settlement recoverable after removal without previewing or claiming an adopted image", async () => {
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  let rejectSettlement = true;
  const request = vi.fn(
    async (
      command: Parameters<AttachmentBridge["request"]>[0],
    ): Promise<AttachmentReply> => {
      if (command.kind === "import-bytes") {
        items = [
          AttachmentSchema.parse({
            ...importedText(command.threadId, command.name),
            mimeType: "image/png",
            representation: "image",
          }),
        ];
        return { kind: "attachments", items };
      }
      if (command.kind === "import-settle" && rejectSettlement)
        throw Error("settlement lost");
      return historyReply(command) ?? { kind: "attachments", items };
    },
  );
  const fixture = await setup(undefined, undefined, { request });
  await pasteFiles(fixture, [
    new File(["image"], "photo.png", { type: "image/png" }),
  ]);
  await act(() =>
    vi.waitFor(() =>
      expect(fixture.container.textContent).toContain(
        "Retry resource settlement",
      ),
    ),
  );
  await act(() =>
    fixture.container
      .querySelector<HTMLButtonElement>('[aria-label="Remove photo.png"]')
      ?.click(),
  );
  expect(fixture.thread().controller.getAttachmentIds()).toEqual([]);
  expect(
    fixture.container.querySelector('[aria-label="File import"]')?.textContent,
  ).not.toContain("Inserted");
  expect(
    fixture.container.querySelector('[aria-label="Preview photo.png"]'),
  ).toBeNull();
  const retry = Array.from(fixture.container.querySelectorAll("button")).find(
    (b) => b.textContent === "Retry resource settlement",
  );
  rejectSettlement = false;
  await act(() => retry?.click());
  await act(() =>
    vi.waitFor(() =>
      expect(
        fixture.thread().attachmentImports!.stateStore.getState().ready,
      ).toBe(true),
    ),
  );
  expect(
    fixture.container.querySelector('[aria-label="File import"]'),
  ).toBeNull();
  expect(fixture.thread().controller.getAttachmentIds()).toEqual([]);
});

it("keeps settlement independent of file Undo and Redo while its successful UI stays quiet", async () => {
  let finishSettlement!: () => void;
  let items: import("../../../modules/input/contracts/public").Attachment[] =
    [];
  const fixture = await setup(undefined, undefined, {
    request: async (command) => {
      if (command.kind === "import-bytes") {
        items = [importedText(command.threadId, command.name)];
        return { kind: "attachments", items };
      }
      if (command.kind === "import-settle")
        return new Promise((resolve) => {
          finishSettlement = () => resolve({ kind: "import-settled" });
        });
      return historyReply(command) ?? { kind: "attachments", items };
    },
  });
  await pasteFiles(fixture, [
    new File(["text"], "source.txt", { type: "text/plain" }),
  ]);
  await act(() =>
    vi.waitFor(() => expect(finishSettlement).toBeTypeOf("function")),
  );
  expect(
    fixture.container.querySelector('[aria-label="File import"]'),
  ).toBeNull();
  expect(fixture.thread().attachmentImports!.stateStore.getState().ready).toBe(
    false,
  );
  await act(() => fixture.editor().commands.undo());
  expect(fixture.thread().controller.getAttachmentIds()).toEqual([]);
  await act(() => finishSettlement());
  expect(fixture.thread().attachmentImports!.stateStore.getState().ready).toBe(
    true,
  );
  expect(fixture.thread().controller.getAttachmentIds()).toEqual([]);
  await act(() => fixture.editor().commands.redo());
  expect(fixture.thread().controller.getAttachmentIds()).toEqual([
    items[0]!.id,
  ]);
  expect(
    fixture.container.querySelector('[aria-label="File import"]'),
  ).toBeNull();
});

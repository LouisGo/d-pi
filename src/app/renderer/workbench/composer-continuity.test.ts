// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { Slice } from "@tiptap/pm/model";
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
    await act(() => root.unmount());
    model.dispose();
    client.clear();
    container.remove();
  }
  vi.unstubAllGlobals();
});

async function setup(
  phase?: "interrupted" | "allowed" | "ready",
  onChooseModel?: () => void,
  attachments?: AttachmentBridge,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const first = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "alpha omega",
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
          busy: false,
          model: null,
          configuration: { code: "runtime.configDefault" },
          message: { code: "runtime.previousSessionReadOnly" },
        }),
      }),
    };
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
  const render = () =>
    act(() =>
      root.render(
        createElement(QueryClientProvider, {
          client,
          children: createElement(I18nProvider, {
            initialSnapshot: { preference: "system", resolvedLocale: "en-US" },
            children: createElement(Composer, {
              key: thread().key,
              thread: thread(),
              model,
              onChooseModel,
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
    first,
    second,
    drafts,
    thread,
    render,
    editor,
    select,
    container,
  };
}

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

it("offers a visible new-session exit beside the disabled send button for a recovered read-only thread", async () => {
  const fixture = await setup("interrupted");
  const container = fixture.editor().view.dom.closest("section");
  expect(container?.textContent).toContain("read-only");
  const button = Array.from(container?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === "New Thread",
  );
  expect(button).toBeDefined();
  const create = vi
    .spyOn(fixture.model, "newThread")
    .mockResolvedValue({ kind: "cancelled" });
  await act(() => button?.click());
  expect(create).toHaveBeenCalledOnce();
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
      return { kind: "attachments", items };
    };
    const fixture = await setup(undefined, undefined, { request });
    const attach = Array.from(
      fixture.container.querySelectorAll("button"),
    ).find((button) => button.textContent === "Attach files");
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
    ).find((button) => button.textContent === "Attach files");
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
      (button) => button.textContent === label,
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

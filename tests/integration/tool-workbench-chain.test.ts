// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import type { Editor } from "@tiptap/core";
import type { IpcRenderer } from "electron";
import { act, createElement, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import {
  type DesktopBridge,
  parseDesktopReply,
} from "../../src/app/contracts/desktop-bridge";
import { createConversationPort } from "../../src/app/preload/bridges/conversation-port";
import { readingWindow } from "../../src/app/renderer/reading/reading-window";
import { createAppRouting } from "../../src/app/renderer/routing/router";
import { AppModel } from "../../src/app/renderer/wiring/model";
import { EditorAdapterContext } from "../../src/app/renderer/workbench/editor-context";
import { createConversationHost } from "../../src/modules/conversation/host/public";
import type { FileEditorComponent } from "../../src/modules/files/renderer/public";
import { DraftSchema } from "../../src/modules/input/contracts/public";
import { parseDraftBlocks } from "../../src/modules/input/core/public";
import { I18nProvider } from "../../src/modules/preferences/renderer/public";
import type { NativeFrame } from "../../src/platform/omp/protocol/public";

it.each([
  { grouped: false, artifact: false, fileNavigation: false },
  { grouped: true, artifact: false, fileNavigation: true },
  { grouped: true, artifact: true, fileNavigation: false },
  { grouped: true, artifact: false, fileNavigation: true, superseded: true },
])(
  "runs the production card → inspector → pin → B editor reference → A virtual source chain (%j)",
  async (scenario) => {
    const { grouped, artifact, fileNavigation } = scenario;
    const superseded = "superseded" in scenario && scenario.superseded;
    let finishFile: (() => void) | undefined;
    const fileGate = new Promise<void>((resolve) => {
      finishFile = resolve;
    });
    const FileEditor: FileEditorComponent = ({
      location,
      canLocate,
      onLocated,
    }) => {
      const ref = useRef<HTMLPreElement>(null);
      useEffect(() => {
        if (location && (canLocate?.() ?? true)) {
          ref.current?.focus();
          onLocated?.(true);
        }
      }, [location, canLocate, onLocated]);
      return createElement(
        "pre",
        { ref, tabIndex: -1, "data-file-viewer": true },
        "sampled file",
      );
    };
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    // Substitute only native IPC and physical geometry. All application/router,
    // Host projection/raw reader, preload broker, inspector and Tiptap are real.
    const geometry = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const rowId = this.dataset.readingRow;
        const index = rowId?.startsWith("saved-")
          ? Number(rowId.slice(6))
          : rowId
            ? 80
            : 0;
        const height = rowId ? 120 : 480;
        const pane = this.closest<HTMLElement>(".reading-pane");
        const top =
          (rowId ? index * 120 : 0) -
          (pane && pane !== this ? pane.scrollTop : 0);
        return {
          x: 0,
          y: top,
          top,
          bottom: top + height,
          left: 0,
          right: 1400,
          width: 1400,
          height,
          toJSON: () => ({}),
        };
      });
    const height = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.closest("[hidden]") ? 0 : 480;
      });
    const scroll = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.hasAttribute("data-reading-pane") ? 10080 : 480;
      });
    const first = DraftSchema.parse({
      schemaVersion: 1,
      threadId: crypto.randomUUID(),
      workingDirectoryId: crypto.randomUUID(),
      directory: "/A",
      title: "Thread A",
      revision: 0,
      text: "A original",
    });
    const second = DraftSchema.parse({
      ...first,
      threadId: crypto.randomUUID(),
      directory: "/B",
      title: "Thread B",
      text: "B original",
    });
    const drafts = new Map([
      [first.threadId, first],
      [second.threadId, second],
    ]);
    let selected = first.threadId;
    const host = createConversationHost();
    const generation = crypto.randomUUID();
    host.start(generation, first.threadId);
    const attachments = new Set<
      (event: { ports: unknown[] }, data: unknown) => void
    >();
    const portCommands: unknown[] = [];
    const conversation = createConversationPort({
      on: (_channel, listener) => {
        attachments.add(listener);
      },
      removeListener: (_channel, listener) => {
        attachments.delete(listener);
      },
      send: (_channel, threadId) => {
        if (threadId !== first.threadId) return;
        queueMicrotask(() => {
          let receive: (event: { data: unknown }) => void = () => {};
          let closed = () => {};
          const port = {
            onmessage: null as ((event: { data: unknown }) => void) | null,
            start: () => {},
            close: () => closed(),
            postMessage: (data: unknown) => {
              portCommands.push(data);
              queueMicrotask(() => receive({ data }));
            },
          };
          for (const attach of attachments)
            attach({ ports: [port] }, { threadId });
          host.attach(
            {
              start: () => {},
              close: () => {},
              on: (event, listener) => {
                if (event === "message") receive = listener;
                else closed = () => listener({ data: null });
              },
              postMessage: (data) =>
                queueMicrotask(() => port.onmessage?.({ data })),
            },
            {
              threadId: first.threadId,
              connectionGeneration: generation,
              nativeSessionKey: "native-A",
            },
          );
        });
      },
    } as unknown as IpcRenderer);
    const raw = "first output\n".repeat(4000);
    const artifactText = "first saved output\n".repeat(40000);
    const bridge: DesktopBridge = {
      conversation,
      files: {
        request: async (command) => {
          if (command.kind === "read" && superseded) await fileGate;
          return {
            kind: "completed",
            operationId: command.operationId,
            traceId: command.traceId,
            reply:
              command.kind === "list"
                ? { kind: "entries", path: "", entries: [], truncated: false }
                : {
                    kind: "text",
                    path: command.path,
                    text: "current file body",
                    bytes: 17,
                    version: "current-v1",
                    capturedAt: "fixture",
                    coverage: "complete",
                  },
          };
        },
        cancel: async (command) => ({ kind: "acknowledged", ...command }),
      },
      git: {
        request: async (command) => ({
          kind: "completed",
          operationId: command.operationId,
          traceId: command.traceId,
          reply: { kind: "unavailable", reason: "not-git" },
        }),
        cancel: async (command) => ({ kind: "acknowledged", ...command }),
      },
      history: {
        projectList: vi.fn(),
        projectRead: vi.fn(),
        tool: vi.fn(),
        cancelRead: vi.fn(),
        requestTool: async (command) => ({
          operationId: command.operationId,
          traceId: command.traceId,
          kind: "completed",
          reply: {
            kind: "tool-detail",
            readerId: command.readerId,
            detail: {
              source: command.artifactKey
                ? {
                    kind: "native-artifact",
                    threadId: first.threadId,
                    nativeSessionKey: "native-A",
                    recordId: "native-result",
                    recordRevision: "native-version",
                    artifactKey: "0",
                    revision: "a".repeat(64),
                  }
                : command.source,
              contentRevision: command.artifactKey
                ? "a".repeat(64)
                : "native-version",
              nativeRecordId: "native-result",
              toolName: "bash",
              argumentsText: "{}",
              text: command.artifactKey ? artifactText : raw,
              lifecycle: "completed",
              coverage: command.artifactKey ? "observed" : "partial",
              truncated: !command.artifactKey,
              artifact: {
                key: "0",
                coverage: "complete",
                expectedBytes: artifactText.length,
              },
            },
          },
        }),
        read: async (threadId) => ({
          kind: "page",
          entries:
            threadId === first.threadId
              ? Array.from({ length: 80 }, (_, index) => ({
                  id: `saved-${index}`,
                  parentId: null,
                  role: "assistant",
                  text: `Saved ${index}`,
                }))
              : [],
          next: null,
          source: "saved",
          nativeSessionKey:
            threadId === first.threadId ? "native-A" : "native-B",
          coverage: "append-order",
          incompleteTail: false,
          omitted: 0,
        }),
      },
      request: async (command) => {
        if (command.kind === "save") {
          const previous = drafts.get(command.threadId)!;
          drafts.set(command.threadId, {
            ...previous,
            text: command.text,
            revision: previous.revision + 1,
          });
          return parseDesktopReply(command, {
            kind: "saved",
            threadId: command.threadId,
            revision: previous.revision + 1,
          });
        }
        if (command.kind === "list-threads")
          return parseDesktopReply(command, {
            kind: "threads",
            threads: [...drafts.values()],
          });
        if (command.kind === "select-thread") selected = command.threadId;
        if (command.kind === "restore" || command.kind === "select-thread")
          return parseDesktopReply(command, {
            kind: "ready",
            draft: drafts.get(selected),
            directoryAvailable: true,
            preferences: { theme: "light", density: "normal", locale: "en-US" },
          });
        throw Error("unexpected boundary command");
      },
      onCloseRequest: () => () => {},
      onCloseCancelled: () => () => {},
      completeClose: () => {},
    };
    const model = new AppModel(bridge);
    await model.start();
    const routing = createAppRouting(model),
      client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container),
      disconnect = routing.connect();
    const settle = () =>
      act(async () => {
        await new Promise((done) => setTimeout(done, 35));
      });
    const button = (label: string) => {
      const found = [
        ...container.querySelectorAll<HTMLButtonElement>(
          "[data-tool-inspector] button",
        ),
      ].find((b) => b.textContent?.trim() === label);
      if (!found)
        throw Error(
          `missing ${label}: ${container.querySelector("[data-tool-inspector]")?.textContent}`,
        );
      return found;
    };
    try {
      await act(async () => {
        root.render(
          createElement(
            QueryClientProvider,
            { client },
            createElement(I18nProvider, {
              initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
              children: createElement(
                EditorAdapterContext,
                { value: FileEditor },
                createElement(RouterProvider, {
                  router: routing.router,
                }),
              ),
            }),
          ),
        );
      });
      await act(async () => {
        await routing.router.load();
        const state = model.getSnapshot();
        if (state.kind !== "ready" || state.threadSelection.kind !== "thread")
          throw Error("missing restored Thread");
        state.threadSelection.thread.reading?.connect(first.threadId);
      });
      await settle();
      await act(() => {
        if (grouped) {
          host.accept({
            type: "message_end",
            message: {
              role: "assistant",
              dPiRecordId: "call-owner",
              content: [
                {
                  type: "toolCall",
                  id: "read-sibling",
                  name: "read",
                  arguments: { path: "/A/a.ts" },
                },
                {
                  type: "toolCall",
                  id: "bash-1",
                  name: "bash",
                  arguments: { command: "printf actual" },
                },
              ],
            },
          } as NativeFrame);
          host.accept({
            type: "tool_execution_start",
            toolCallId: "read-sibling",
            toolName: "read",
            args: { path: "/A/a.ts" },
          } as NativeFrame);
          host.accept({
            type: "tool_execution_end",
            toolCallId: "read-sibling",
            toolName: "read",
            result: {
              content: [{ type: "text", text: "source read" }],
              ...(superseded
                ? {
                    details: {
                      displayContent: { text: "source read", startLine: 1 },
                    },
                  }
                : {}),
            },
            isError: false,
          } as NativeFrame);
        }
        host.accept({
          type: "tool_execution_start",
          toolCallId: "bash-1",
          toolName: "bash",
          args: { command: "printf actual" },
        } as NativeFrame);
        host.accept({
          type: "tool_execution_update",
          toolCallId: "bash-1",
          toolName: "bash",
          partialResult: { content: [{ type: "text", text: raw }] },
        } as NativeFrame);
      });
      await settle();
      const pane = container.querySelector<HTMLElement>(
        "[data-reading-pane=conversation]",
      )!;
      await act(() => {
        const window = readingWindow(pane);
        if (!window) throw Error("missing real virtualizer");
        const row = window.rows.at(-1);
        if (!row) throw Error("missing tool row");
        expect(window.mount(row.id)).toBe(true);
      });
      if (grouped) {
        const groupButton = pane.querySelector<HTMLButtonElement>(
          "[data-activity-group] button",
        );
        expect(groupButton).not.toBeNull();
        await act(() => groupButton?.click());
        await act(() => {
          const window = readingWindow(pane);
          const row = window?.rows.at(-1);
          expect(row && window?.mount(row.id)).toBe(true);
        });
      }
      const open = container.querySelector<HTMLButtonElement>(
        "[data-command-card] [data-command-open]",
      );
      expect(open).not.toBeNull();
      expect(
        container.querySelector("[data-command-card] pre")?.textContent?.length,
      ).toBeLessThanOrEqual(2048);
      await act(() => open?.click());
      await settle();
      if (artifact) {
        await act(() =>
          host.accept({
            type: "tool_execution_end",
            dPiRecordId: "native-result",
            toolCallId: "bash-1",
            toolName: "bash",
            isError: false,
            result: {
              content: [{ type: "text", text: raw }],
              details: {
                meta: {
                  truncation: {
                    artifactId: "0",
                    totalBytes: artifactText.length,
                  },
                },
              },
            },
          } as NativeFrame),
        );
        await settle();
        await act(() => button("Read saved output").click());
        await settle();
      }
      const surface = model.workbench.stateStore.getState().surfaces.at(-1)!;
      const expectedText = artifact ? artifactText : raw;
      const output = container.querySelector<HTMLTextAreaElement>(
        ".tool-inspector-output",
      )!;
      expect(output.value).toBe(expectedText);
      expect(output.value.length).toBeGreaterThan(32768);
      await act(() => button("Pin").click());
      // Native onSelect is produced by keyboard selection; do not directly call
      // WindowWorkbench.reference or the draft insertion API.
      await act(() => {
        output.focus();
        output.setSelectionRange(0, 5);
        output.dispatchEvent(
          new KeyboardEvent("keyup", { key: "Shift", bubbles: true }),
        );
      });
      expect(
        model.workbench.stateStore.getState().surfaces[0]?.selection?.end,
      ).toBe(5);
      if (grouped) {
        await act(() =>
          pane
            .querySelector<HTMLButtonElement>("[data-activity-group] button")
            ?.click(),
        );
        expect(
          model.workbench.stateStore.getState().surfaces[0]?.selection?.end,
        ).toBe(5);
      }
      await act(() =>
        routing.router.navigate({
          to: "/threads/$threadId",
          params: { threadId: second.threadId },
          search: { view: "conversation" },
        }),
      );
      await settle();
      expect(
        container.querySelector("[data-context-destination]")?.textContent,
      ).toContain("Thread B");
      await act(() =>
        host.accept({
          type: "tool_execution_end",
          toolCallId: "bash-1",
          toolName: "bash",
          isError: false,
          result: { content: [{ type: "text", text: "final output" }] },
        } as NativeFrame),
      );
      await settle();
      expect(
        container
          .querySelector(".tool-inspector-output")
          ?.getAttribute("readonly"),
      ).not.toBeNull();
      expect(
        container.querySelector<HTMLTextAreaElement>(".tool-inspector-output")
          ?.value,
      ).toBe(expectedText);
      await act(() => button("Reference selected text").click());
      const b = model.controller!;
      const context = parseDraftBlocks(b.getTextSnapshot()).find(
        (block) => block.kind === "context",
      );
      expect(context).toMatchObject({
        kind: "context",
        value: {
          text: "first",
          contentRevision: surface.detail?.contentRevision,
          source: artifact
            ? {
                kind: "native-artifact",
                threadId: first.threadId,
                recordId: "native-result",
                revision: "a".repeat(64),
              }
            : { threadId: first.threadId, toolCallId: "bash-1" },
        },
      });
      expect(drafts.get(first.threadId)?.text).toBe("A original");
      const editor = container.querySelector<HTMLElement & { editor: Editor }>(
        ".tiptap",
      )!.editor;
      await act(() => {
        expect(editor.commands.undo()).toBe(true);
      });
      expect(b.getTextSnapshot()).toBe("B original");
      await act(() => {
        expect(editor.commands.redo()).toBe(true);
      });
      expect(b.getTextSnapshot()).toContain("[d-pi:context:v1");
      await act(async () => {
        await b.flush();
      });
      await act(() => button("Return to source").click());
      await settle();
      await settle();
      expect(model.controller?.threadId).toBe(first.threadId);
      expect(routing.router.state.location.pathname).toBe(
        `/threads/${first.threadId}`,
      );
      expect(model.workbench.stateStore.getState().returning).toBeNull();
      expect(container.querySelector("[data-command-open]")).not.toBeNull();
      expect(document.activeElement).toBe(
        container.querySelector("[data-reading-pane=conversation]"),
      );
      expect(drafts.get(second.threadId)?.text).toContain("[d-pi:context:v1");
      if (fileNavigation) {
        const state = model.reading!.stateStore.getState();
        const id = state.itemIds.find(
          (id) => state.itemsById.get(id)?.tool?.toolCallId === "read-sibling",
        );
        if (id === undefined) throw Error("missing observed read entity");
        const key = `live:${JSON.stringify([generation, id])}`;
        await act(() => {
          model.reading!.activities.revealMember(key);
        });
        await act(() => {
          const window = readingWindow(
            container.querySelector<HTMLElement>(
              "[data-reading-pane=conversation]",
            )!,
          );
          expect(window?.mount(key)).toBe(true);
        });
        const current = container.querySelector<HTMLButtonElement>(
          '[data-resource-current="/A/a.ts"]',
        );
        expect(current?.disabled).toBe(false);
        await act(() => current?.click());
        await settle();
        await settle();
        expect(routing.router.state.location.search.view).toBe("files");
        const filesPane = container.querySelector<HTMLElement>(
          "[data-reading-pane=files]",
        )!;
        expect(filesPane.hidden).toBe(false);
        expect(filesPane.querySelector(".file-result")?.textContent).toContain(
          "a.ts",
        );
        if (superseded) {
          expect(
            model.workbench.stateStore.getState().workspaceNavigation,
          ).not.toBeNull();
          await act(() => model.workbench.select(surface.id));
          await settle();
          const focused = document.activeElement;
          expect(
            container.querySelector("[data-tool-inspector]")?.contains(focused),
          ).toBe(true);
          await act(() => finishFile?.());
          await settle();
          expect(filesPane.querySelector("[data-file-viewer]")).not.toBeNull();
          expect(document.activeElement).toBe(focused);
        }
        expect(filesPane.querySelector(".file-result")?.textContent).toContain(
          "current-v1",
        );
        expect(
          model.workbench.stateStore.getState().workspaceNavigation,
        ).toBeNull();
      }
      await act(() =>
        container
          .querySelector("[data-tool-inspector]")
          ?.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          ),
      );
      await settle();
      expect(model.workbench.stateStore.getState().surfaces).toHaveLength(0);
      expect(portCommands).toContainEqual(
        expect.objectContaining({ kind: "release-tool" }),
      );
      expect(portCommands).not.toContainEqual(
        expect.objectContaining({ kind: "abort" }),
      );
    } finally {
      finishFile?.();
      await act(() => root.unmount());
      disconnect();
      routing.dispose();
      model.dispose();
      host.dispose();
      client.clear();
      container.remove();
      geometry.mockRestore();
      height.mockRestore();
      scroll.mockRestore();
      vi.unstubAllGlobals();
    }
  },
);

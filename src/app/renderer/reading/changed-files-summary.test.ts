// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type {
  GitBridge,
  GitReply,
} from "../../../modules/changes/contracts/public";
import type {
  ConversationEvent,
  ConversationItem,
} from "../../../modules/conversation/contracts/public";
import { ConversationModel } from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ToolWorkbenchContext } from "../workbench/tool-inspector";
import { WindowWorkbench } from "../workbench/window-workbench";
import { ChangedFilesSummary } from "./changed-files-summary";
import type { ToolChangeEvidence } from "./reported-changes";

function report(path: string): ToolChangeEvidence {
  return {
    semantic: {
      kind: "file-change",
      transportTool: "edit",
      effectiveTool: "edit",
      phase: "result",
      partial: false,
      truncated: false,
      changes: [{ path, failed: false, snapshotsPruned: false }],
    },
    target: {
      source: {
        kind: "live-tool",
        threadId: "A",
        nativeSessionKey: "native",
        connectionGeneration: "generation",
        toolCallId: "call",
      },
      title: "edit",
      threadTitle: "A",
      rowId: "call",
    },
  };
}

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
});
async function mount(git?: GitBridge, owner = "A") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let deliver: (event: ConversationEvent) => void = () => {};
  const model = new ConversationModel({
    connect: (_thread, listener) => {
      deliver = listener;
      return () => {};
    },
  });
  model.connect("A");
  const evidence = vi.fn(() => [report("a.ts")]);
  const workbench = new WindowWorkbench({
    insert: vi.fn(),
    select: async () => true,
  });
  const reveal = vi.spyOn(workbench, "reveal");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let active = true;
  const render = () =>
    act(() =>
      root.render(
        createElement(
          QueryClientProvider,
          { client },
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: createElement(
              ToolWorkbenchContext,
              { value: workbench },
              createElement(ChangedFilesSummary, {
                model,
                evidence,
                git,
                active,
                resource: {
                  threadId: owner,
                  workingDirectoryId: "workspace",
                  directory: "/project",
                  title: owner,
                },
              }),
            ),
          }),
        ),
      ),
    );
  await render();
  const open = async () => {
    const details = container.querySelector("details");
    if (!details) throw Error("missing disclosure");
    await act(() => {
      details.open = true;
      details.dispatchEvent(new Event("toggle", { bubbles: true }));
    });
  };
  const click = async (text: string) => {
    const button = [...container.querySelectorAll("button")].find((element) =>
      element.textContent?.includes(text),
    );
    if (!button) throw Error(`missing ${text}: ${container.textContent}`);
    await act(() => button.click());
    return button;
  };
  cleanups.push(async () => {
    await act(() => root.unmount());
    client.clear();
    workbench.dispose();
    model.dispose();
    container.remove();
  });
  return {
    model,
    deliver: (event: ConversationEvent) => deliver(event),
    client,
    evidence,
    workbench,
    reveal,
    container,
    open,
    click,
    hide: async () => {
      active = false;
      await render();
    },
  };
}
it("does not rescan reports on repeated body appends, but refreshes same-count path replacements", async () => {
  const view = await mount();
  const observation = report("a.ts");
  const item: ConversationItem = {
    id: 1,
    role: "tool",
    text: "",
    state: "complete",
    label: { kind: "literal", text: "edit" },
    tool: {
      toolCallId: "call",
      name: "edit",
      lifecycle: "succeeded",
      coverage: "complete",
      truncated: false,
      observed: { start: true, end: true, result: true },
      semantic: observation.semantic,
    },
  };
  const connectionGeneration = crypto.randomUUID();
  await act(() =>
    view.deliver({
      kind: "snapshot",
      connectionGeneration,
      seq: 0,
      gap: false,
      items: [item],
    }),
  );
  await view.open();
  const before = view.evidence.mock.calls.length;
  const { text: _text, ...metadata } = item;
  await act(() => {
    for (let seq = 1; seq <= 100; seq++)
      view.deliver({
        kind: "append",
        connectionGeneration,
        seq,
        gap: false,
        droppedBefore: 0,
        item: metadata,
        text: "x",
        thinking: "",
      });
  });
  expect(view.evidence).toHaveBeenCalledTimes(before);
  view.evidence.mockImplementation(() => [report("b.ts")]);
  if (!item.tool) throw Error("missing tool");
  const tool = item.tool;
  await act(() =>
    view.deliver({
      kind: "update",
      connectionGeneration,
      seq: 101,
      gap: false,
      droppedBefore: 0,
      item: { ...item, tool: { ...tool, semantic: report("b.ts").semantic } },
    }),
  );
  expect(view.evidence).toHaveBeenCalledTimes(before + 1);
  expect(view.container.textContent).toContain("b.ts");
});
function bridge(diff?: () => Promise<GitReply>): GitBridge {
  return {
    request: vi.fn(async (command) => ({
      kind: "completed",
      operationId: command.operationId,
      traceId: command.traceId,
      reply:
        command.kind === "diff"
          ? await (diff?.() ?? Promise.resolve(diffReply()))
          : {
              kind: "changes",
              repository: "/project",
              head: "HEAD-id",
              capturedAt: "sample-time",
              coverage: "project-paths-current-sample",
              entries: [
                {
                  path: "git-only.ts",
                  scope: "index-worktree",
                  status: "modified",
                },
              ],
              truncated: false,
            },
    })),
    cancel: vi.fn(async (identity) => ({ kind: "acknowledged", ...identity })),
  };
}
function diffReply(): GitReply {
  return {
    kind: "diff",
    repository: "/project",
    head: "HEAD-id",
    capturedAt: "sample-time",
    coverage: "single-file-current-sample",
    path: "git-only.ts",
    scope: "index-worktree",
    left: {
      kind: "text",
      text: "before",
      source: "index",
      version: "left-hash",
      coverage: "complete",
    },
    right: {
      kind: "text",
      text: "after",
      source: "worktree",
      version: "right-hash",
      coverage: "complete",
    },
  };
}
it("reads no evidence or Git while collapsed and samples Git only on explicit action", async () => {
  const git = bridge();
  const view = await mount(git);
  expect(view.evidence).not.toHaveBeenCalled();
  expect(git.request).not.toHaveBeenCalled();
  await view.open();
  expect(view.evidence).toHaveBeenCalledTimes(1);
  expect(view.container.textContent).toContain("a.ts");
  expect(git.request).not.toHaveBeenCalled();
  await view.click("Sample current Git changes");
  await act(async () => {
    await vi.waitFor(() =>
      expect(view.container.textContent).toContain("git-only.ts"),
    );
  });
  expect(view.container.textContent).toContain("Tool-reported changes");
  expect(view.container.textContent).toContain("Current Git sample");
  await view.click("git-only.ts");
  await act(async () => {
    await vi.waitFor(() =>
      expect(view.reveal).toHaveBeenCalledWith({
        kind: "diff",
        diff: {
          threadId: "A",
          directory: "/project",
          path: "git-only.ts",
          scope: "index-worktree",
          leftVersion: "left-hash",
          rightVersion: "right-hash",
          side: "right",
        },
      }),
    );
  });
});
it("does not route a tool report into another thread's current workspace", async () => {
  const view = await mount(undefined, "B");
  await view.open();
  const button = [...view.container.querySelectorAll("button")].find(
    (element) => element.textContent?.includes("current file"),
  );
  expect(button?.disabled).toBe(true);
});
it("does not override a later user intent after a delayed Diff capture", async () => {
  let finish: ((reply: GitReply) => void) | undefined;
  const git = bridge(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = await mount(git);
  await view.open();
  await view.click("Sample current Git changes");
  await act(async () => {
    await vi.waitFor(() =>
      expect(view.container.textContent).toContain("git-only.ts"),
    );
  });
  await view.click("git-only.ts");
  view.workbench.cancelReturn();
  await act(async () => {
    finish?.(diffReply());
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(view.reveal).not.toHaveBeenCalled();
});
it("releases pending Git readers when its reading surface becomes inactive", async () => {
  const git = bridge(() => new Promise(() => {}));
  const view = await mount(git);
  await view.open();
  await view.click("Sample current Git changes");
  await act(async () => {
    await vi.waitFor(() =>
      expect(view.container.textContent).toContain("git-only.ts"),
    );
  });
  await view.click("git-only.ts");
  await view.hide();
  await vi.waitFor(() => expect(git.cancel).toHaveBeenCalledTimes(1));
  await vi.waitFor(() =>
    expect(view.client.getQueryCache().getAll()).toHaveLength(0),
  );
});

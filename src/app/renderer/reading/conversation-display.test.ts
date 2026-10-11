// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../modules/conversation/contracts/public";
import { decodeToolSemantic } from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ToolWorkbenchContext } from "../workbench/tool-inspector";
import {
  type ToolTarget,
  WindowWorkbench,
} from "../workbench/window-workbench";
import { ConversationItemView } from "./conversation";
import { MessageMedia } from "./message-media";
import { ToolBodyBoundary } from "./tool-semantic-body";

vi.mock("./reading-body", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./reading-body")>();
  return {
    ...actual,
    ReadingBody: (props: Parameters<typeof actual.ReadingBody>[0]) => {
      if (props.text.includes("THROW_RENDERER_FIXTURE"))
        throw Error("Injected semantic presenter failure");
      return createElement(actual.ReadingBody, props);
    },
  };
});

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function mount(
  item: ConversationItem,
  extra: Partial<Parameters<typeof ConversationItemView>[0]> = {},
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    container.remove();
  });
  await act(() =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
        children: createElement(ConversationItemView, {
          item,
          rowId: "native:user",
          ...extra,
        }),
      }),
    ),
  );
  return container;
}
const base: ConversationItem = {
  id: 1,
  role: "user",
  state: "complete",
  label: { kind: "literal", text: "You" },
  text: "Keep **literal** prompt\nSecond line",
};
it("labels planned write paths as intent rather than reported changes", async () => {
  const container = await mount({
    ...base,
    role: "tool",
    state: "streaming",
    tool: {
      name: "write",
      toolCallId: "intent",
      lifecycle: "running",
      observed: ["start"],
      coverage: "observed",
      truncated: false,
      semantic: decodeToolSemantic(
        "write",
        { path: "/a" },
        undefined,
        "intent",
      ),
    },
  });
  await act(() => container.querySelector("summary")?.click());
  expect(container.textContent).toContain("Planned file paths");
  expect(container.textContent).not.toContain("Tool-reported changes");
});
it("renders a published agent read as internal raw evidence without a current-file action", async () => {
  const container = await mount({
    ...base,
    role: "tool",
    text: "ACTUAL_PUBLISHED_CHILD_RESULT",
    tool: {
      name: "read",
      toolCallId: "read-child",
      lifecycle: "completed",
      observed: ["start", "end"],
      coverage: "observed",
      truncated: false,
      semantic: decodeToolSemantic(
        "read",
        { path: "agent://first-task" },
        {
          details: {
            resolvedPath: "/native/first-task.md",
            meta: { source: { type: "internal", value: "agent://first-task" } },
          },
        },
        "result",
      ),
    },
  });
  expect(
    container.querySelector('[data-tool-body="generic"]')?.textContent,
  ).toContain("ACTUAL_PUBLISHED_CHILD_RESULT");
  expect(container.querySelector("[data-resource-current]")).toBeNull();
});
it("isolates a presenter exception, preserves raw evidence and recovers on a new revision", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    container.remove();
  });
  function BrokenBody() {
    throw Error("presenter failure");
  }
  const render = (revision: number, broken: boolean) =>
    act(() =>
      root.render(
        createElement(
          "div",
          null,
          createElement(
            "span",
            { "data-native-state": "completed" },
            "completed",
          ),
          createElement(ToolBodyBoundary, {
            revision,
            fallback: createElement("p", null, "available native evidence"),
            children: broken
              ? createElement(BrokenBody)
              : createElement("p", null, "recovered view"),
          }),
        ),
      ),
    );
  await render(1, true);
  expect(container.textContent).toContain("available native evidence");
  expect(container.querySelector("[data-native-state]")?.textContent).toBe(
    "completed",
  );
  await render(2, false);
  expect(container.textContent).toContain("recovered view");
});
it("isolates an exception in the formal semantic Body while another Body and its actual source action remain usable", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  const workbench = new WindowWorkbench({
    insert: vi.fn(),
    select: async () => true,
  });
  const reveal = vi.spyOn(workbench, "reveal");
  const target: ToolTarget = {
    source: {
      kind: "live-tool",
      threadId: "A",
      nativeSessionKey: "native",
      connectionGeneration: crypto.randomUUID(),
      toolCallId: "broken",
    },
    rowId: "live-broken",
    title: "read",
    threadTitle: "A",
  };
  const makeItem = (
    id: number,
    text: string,
    excerpt: string,
  ): ConversationItem => ({
    ...base,
    id,
    role: "tool",
    text,
    tool: {
      name: "read",
      toolCallId: id === 1 ? "broken" : "healthy",
      lifecycle: "completed",
      observed: ["start", "end"],
      coverage: "observed",
      truncated: false,
      semantic: decodeToolSemantic(
        "read",
        { path: "/a.ts" },
        { details: { displayContent: { text: excerpt, startLine: 1 } } },
        "result",
      ),
    },
  });
  const broken = makeItem(
    1,
    "AVAILABLE_ORIGINAL_RESULT",
    "THROW_RENDERER_FIXTURE",
  );
  const healthy = makeItem(2, "HEALTHY_RAW_RESULT", "HEALTHY_SEMANTIC_RESULT");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(async () => {
    await act(() => root.unmount());
    workbench.dispose();
    container.remove();
  });
  await act(() =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
        children: createElement(
          ToolWorkbenchContext,
          { value: workbench },
          createElement(ConversationItemView, {
            item: broken,
            rowId: "live-broken",
            toolTarget: target,
          }),
          createElement(ConversationItemView, {
            item: healthy,
            rowId: "live-healthy",
          }),
        ),
      }),
    ),
  );
  const rows = container.querySelectorAll("article");
  expect(rows).toHaveLength(2);
  expect(rows[0]?.textContent).toContain("AVAILABLE_ORIGINAL_RESULT");
  expect(rows[0]?.querySelector('[role="status"]')).not.toBeNull();
  expect(rows[1]?.textContent).toContain("HEALTHY_SEMANTIC_RESULT");
  expect(broken.tool?.lifecycle).toBe("completed");
  const source = rows[0]?.querySelector<HTMLButtonElement>(
    "[data-command-open]",
  );
  expect(source?.disabled).toBe(false);
  await act(() => source?.click());
  expect(reveal).toHaveBeenCalledWith({ kind: "activity", activity: target });
});
it.each(["grep", "edit"])(
  "retains native %s errors and post-operation warnings alongside semantic evidence",
  async (name) => {
    const text = "Native warning: syntax repair failed";
    const container = await mount({
      ...base,
      role: "tool",
      state: "failed",
      text,
      tool: {
        name,
        toolCallId: "failed-call",
        lifecycle: "failed",
        observed: ["end"],
        coverage: "partial",
        truncated: false,
        semantic: decodeToolSemantic(
          name,
          { path: "/a" },
          {
            isError: true,
            details:
              name === "edit"
                ? { path: "/a", diff: "+change" }
                : { fileMatches: [] },
          },
          "result",
        ),
      },
    });
    const raw = container.querySelector<HTMLDetailsElement>(
      "[data-tool-native-output]",
    );
    expect(raw).not.toBeNull();
    await act(() => raw?.querySelector("summary")?.click());
    expect(raw?.textContent).toContain(text);
  },
);
it.each([
  [
    "read",
    { path: "/a.ts" },
    { details: { displayContent: { text: "observed source", startLine: 9 } } },
    "resource-read",
    "observed source",
  ],
  [
    "find",
    { query: "needle" },
    {
      details: {
        hits: [
          {
            rel: "a.ts",
            ranges: [{ start: 4, end: 5, snippet: "actual match" }],
          },
        ],
      },
    },
    "search",
    "actual match",
  ],
  [
    "write",
    { path: "xd://edit" },
    {
      details: {
        xdev: {
          tool: "edit",
          mode: "execute",
          inner: { path: "/a", diff: "-before\n+after" },
        },
      },
    },
    "file-change",
    "+after",
  ],
] as const)(
  "renders %s through its effective native Body",
  async (name, args, result, kind, text) => {
    const container = await mount({
      ...base,
      role: "tool",
      text: "raw fallback",
      tool: {
        name,
        toolCallId: "native-call",
        lifecycle: "completed",
        observed: ["start", "end"],
        coverage: "observed",
        truncated: false,
        semantic: decodeToolSemantic(name, args, result, "result"),
      },
    });
    expect(
      container.querySelector(`[data-tool-body="${kind}"]`)?.textContent,
    ).toContain(text);
    expect(container.querySelector("[data-tool-body]")?.textContent).toContain(
      "Native result",
    );
  },
);
it("places sent media and text together inside the bubble and displays the real message time", async () => {
  const container = await mount(
    { ...base, timestamp: 1791500000000, text: "Question\n[image: shot.png]" },
    {
      displayText: "Question",
      media: createElement(
        "div",
        { "data-message-media": true },
        createElement("img", { alt: "shot.png" }),
        "Question",
      ),
    },
  );
  const row = container.querySelector("article")!;
  const media = row.querySelector("[data-message-media]")!;
  const bubble = row.querySelector(".user-message-bubble")!;
  expect(bubble.contains(media)).toBe(true);
  expect(bubble.textContent).toBe("Question");
  expect(row.querySelector("time")?.dateTime).toBe(
    new Date(1791500000000).toISOString(),
  );
});
it("keeps an authored user prompt literal and exposes its stable turn identity", async () => {
  const container = await mount(base);
  const bubble = container.querySelector(
    "[data-message-role=user] .user-message-bubble",
  );
  expect(bubble?.textContent).toBe(base.text);
  expect(bubble?.querySelector("strong")).toBeNull();
  expect(
    container
      .querySelector("[data-conversation-turn]")
      ?.getAttribute("data-conversation-turn"),
  ).toBe("native:user");
});
it("copies the exact prompt through an accessible icon action", async () => {
  const writeText = vi.fn(async () => {});
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const container = await mount(base);
  const action = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Copy"]',
  );
  expect(action).not.toBeNull();
  await act(async () => action?.click());
  expect(writeText).toHaveBeenCalledWith(base.text);
  expect(container.querySelector('[role="status"]')?.textContent).toContain(
    "Copied",
  );
});
it("uses one compact, initially collapsed tool row and retains failure detail", async () => {
  const container = await mount({
    ...base,
    role: "tool",
    state: "failed",
    label: { kind: "literal", text: "read" },
    text: "/long/path: missing",
  });
  const disclosure = container.querySelector("details");
  expect(disclosure?.open).toBe(false);
  expect(disclosure?.querySelector("summary")?.textContent).toContain("read");
  expect(disclosure?.querySelector("summary")?.textContent).toContain("Failed");
  await act(() => disclosure?.querySelector("summary")?.click());
  expect(disclosure?.open).toBe(true);
  expect(disclosure?.textContent).toContain("/long/path: missing");
  expect(container.querySelector(".message-heading")).toBeNull();
});
it("keeps engine labels out of the reply and separates native thinking from the answer", async () => {
  const container = await mount({
    ...base,
    role: "assistant",
    label: { kind: "literal", text: "OMP" },
    text: "Answer",
    thinking: "Observed thinking",
  });
  expect(container.textContent).not.toContain("OMP");
  const thought = container.querySelector("details");
  expect(thought?.open).toBe(false);
  expect(thought?.querySelector("summary")?.textContent).toContain("Thinking");
  expect(thought?.querySelector(".thinking-content")).toBeNull();
  expect(
    container.querySelector("article > [data-reading-text]")?.textContent,
  ).toBe("Answer");
  await act(() => thought?.querySelector("summary")?.click());
  expect(thought?.open).toBe(true);
  expect(thought?.textContent).toContain("Observed thinking");
});
it("shows failure as a conversation state and keeps transport detail in a closed disclosure", async () => {
  const container = await mount({
    ...base,
    role: "assistant",
    state: "failed",
    detail: "OMP transport detail",
  });
  const detail = container.querySelector("details");
  expect(detail).not.toBeNull();
  expect(detail?.open).toBe(false);
  expect(detail?.textContent).toContain("OMP transport detail");
  expect(container.querySelector(".message-status")?.textContent).toBe(
    "Failed",
  );
});

it("reveals structured tool observations without interpreting arguments as mutation evidence", async () => {
  const container = await mount({
    ...base,
    role: "tool",
    text: "Observed output",
    label: { kind: "literal", text: "edit" },
    tool: {
      toolCallId: "native-edit-1",
      name: "edit",
      lifecycle: "completed",
      observed: ["start", "update", "end"],
      coverage: "partial",
      truncated: true,
      arguments: {
        value: { path: "src/example.ts", proposed: "not a proven diff" },
        truncated: false,
      },
      progress: { value: { phase: "checking" }, truncated: false },
      result: { value: { changed: true }, truncated: true },
    },
  });
  const outer = container.querySelector("details");
  await act(() => outer?.querySelector("summary")?.click());
  const observation = container.querySelector<HTMLDetailsElement>(
    "[data-tool-observation]",
  );
  expect(observation).not.toBeNull();
  expect(observation?.open).toBe(false);
  expect(observation?.querySelector("pre")).toBeNull();
  await act(() => observation?.querySelector("summary")?.click());
  expect(observation?.textContent).toContain("native-edit-1");
  expect(observation?.textContent).toContain("src/example.ts");
  expect(observation?.textContent).toContain("checking");
  expect(observation?.textContent).toContain("Showing part");
  expect(container.textContent).not.toContain("Diff");
});

it("renders frozen file tags inline at their submitted positions, including repeated mentions", async () => {
  const container = await mount(
    { ...base, text: "frozen body" },
    {
      displayText: "Before  after\nAgain ",
      media: createElement(MessageMedia, {
        includeText: true,
        threadId: "thread",
        bridge: {} as Parameters<typeof MessageMedia>[0]["bridge"],
        entry: {
          id: "entry",
          parentId: null,
          role: "user",
          text: "frozen body",
          files: [
            {
              name: "notes.md",
              byteLength: 13000,
              contextKind: "external",
              start: 0,
              end: 11,
            },
          ],
          inputParts: [
            { kind: "text", text: "Before " },
            { kind: "file", index: 0 },
            { kind: "text", text: " after\nAgain " },
            { kind: "file", index: 0 },
          ],
        },
      }),
    },
  );
  const bubble = container.querySelector(".user-message-bubble")!;
  const tags = bubble.querySelectorAll(".composer-context-token");
  expect(tags).toHaveLength(2);
  expect(tags[0]?.textContent).toContain("notes.md13 KB");
  expect(bubble.querySelector(".user-message-content")?.textContent).toBe(
    "Before  notes.md13 KB  after\nAgain  notes.md13 KB ",
  );
  expect(bubble.querySelector(".message-media")?.children).toHaveLength(0);
  await act(() => (tags[0] as HTMLButtonElement).click());
  expect(document.querySelector(".message-file-preview")?.textContent).toBe(
    "frozen body",
  );
});

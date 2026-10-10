// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { ConversationItem } from "../../../modules/conversation/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ConversationItemView } from "./conversation";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.unstubAllGlobals();
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
it("places sent media above the literal bubble and displays the real message time", async () => {
  const container = await mount(
    { ...base, timestamp: 1791500000000, text: "Question\n[image: shot.png]" },
    {
      displayText: "Question",
      media: createElement(
        "div",
        { "data-message-media": true },
        createElement("img", { alt: "shot.png" }),
      ),
    },
  );
  const row = container.querySelector("article")!;
  const media = row.querySelector("[data-message-media]")!;
  const bubble = row.querySelector(".user-message-bubble")!;
  expect(
    media.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
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
      arguments: { value: { path: "src/example.ts", proposed: "not a proven diff" }, truncated: false },
      progress: { value: { phase: "checking" }, truncated: false },
      result: { value: { changed: true }, truncated: true },
    },
  });
  const outer = container.querySelector("details");
  await act(() => outer?.querySelector("summary")?.click());
  const observation = container.querySelector<HTMLDetailsElement>("[data-tool-observation]");
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

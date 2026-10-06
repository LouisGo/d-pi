// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ConversationModel } from "../../../modules/conversation/core/public";
import { ConversationProjection } from "../../../modules/conversation/host/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { Conversation } from "./conversation";

const renders = vi.hoisted(() => ({ texts: [] as string[] }));
vi.mock("./markdown", () => ({
  Markdown: ({ text }: { text: string }) => {
    renders.texts.push(text);
    return createElement("p", null, text);
  },
}));
it("reaches native identities and results in both locales, restores on reconnect and isolates Thread switches", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  for (const locale of ["zh-CN", "en-US"] as const) {
    const generation = crypto.randomUUID();
    const projection = new ConversationProjection(generation, () => {});
    projection.accept({
      type: "subagent_lifecycle",
      payload: {
        id: "native-run-a",
        index: 0,
        agent: "task",
        agentSource: "builtin",
        status: "started",
        parentToolCallId: "call-a",
        sessionFile: "/private/native/a",
      },
    });
    projection.accept({
      type: "subagent_event",
      payload: {
        id: "native-run-a",
        event: {
          type: "message_end",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "CHILD_RESULT" }],
          },
        },
      },
    });
    projection.accept({
      type: "subagent_lifecycle",
      payload: {
        id: "native-run-a",
        index: 0,
        agent: "task",
        agentSource: "builtin",
        status: "completed",
        parentToolCallId: "call-a",
        sessionFile: "/private/native/a",
      },
    });
    const callbacks: ((
      event: ReturnType<ConversationProjection["snapshot"]>,
    ) => void)[] = [];
    const model = new ConversationModel({
      connect: (thread, listener) => {
        callbacks.push(listener);
        if (thread === "first") listener(projection.snapshot());
        return () => {};
      },
    });
    model.connect("first");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          createElement(I18nProvider, {
            initialSnapshot: { preference: locale, resolvedLocale: locale },
            children: createElement(Conversation, { model }),
          }),
        ),
      );
      expect(
        container
          .querySelector('[data-subagent-id="native-run-a"]')
          ?.getAttribute("data-subagent-status"),
      ).toBe("completed");
      expect(container.textContent).toContain("CHILD_RESULT");
      expect(container.textContent).not.toContain("/private/");
      expect(container.querySelector("details[open]")).not.toBeNull();
      const count = renders.texts.filter(
        (text) => text === "CHILD_RESULT",
      ).length;
      await act(() => {
        model.connect("first");
      });
      expect(container.textContent).toContain("CHILD_RESULT");
      expect(
        renders.texts.filter((text) => text === "CHILD_RESULT").length,
      ).toBeGreaterThanOrEqual(count);
      await act(() => model.connect("second"));
      expect(container.querySelector("[data-subagent-id]")).toBeNull();
      await act(() => callbacks[0]?.(projection.snapshot()));
      expect(container.querySelector("[data-subagent-id]")).toBeNull();
    } finally {
      await act(() => root.unmount());
      model.dispose();
      projection.dispose();
      container.remove();
    }
  }
  vi.unstubAllGlobals();
});

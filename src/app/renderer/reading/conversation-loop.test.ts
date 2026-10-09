// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type {
  ConversationEvent,
  ConversationItem,
} from "../../../modules/conversation/contracts/public";
import { ConversationModel } from "../../../modules/conversation/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { Conversation } from "./conversation";

vi.mock("./markdown", () => ({
  Markdown: ({ text }: { text: string }) => createElement("p", null, text),
}));

it.each(["gap", "truncated"] as const)(
  "offers native history from a nonempty live %s without changing execution",
  async (kind) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const onOpenHistory = vi.fn();
    const model = new ConversationModel({
      connect: (_thread, listener) => {
        listener({
          kind: "snapshot",
          connectionGeneration: "host",
          seq: 0,
          gap: kind === "gap",
          items: [
            {
              id: 1,
              role: "assistant",
              state: "complete",
              text: "retained answer",
              truncated: kind === "truncated",
              label: { kind: "literal", text: "OMP" },
            },
          ],
        });
        return () => {};
      },
    });
    model.connect("thread");
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(() =>
        root.render(
          createElement(I18nProvider, {
            initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
            children: createElement(Conversation, { model, onOpenHistory }),
          }),
        ),
      );
      const button = [...host.querySelectorAll("button")].find(
        (node) => node.textContent === "Conversation details",
      );
      expect(button).toBeDefined();
      await act(() => button?.click());
      expect(onOpenHistory).toHaveBeenCalledTimes(1);
      expect(model.getSnapshot()?.items[0]?.text).toBe("retained answer");
    } finally {
      await act(() => root.unmount());
      model.dispose();
      host.remove();
      vi.unstubAllGlobals();
    }
  },
);

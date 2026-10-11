// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import type { HistoryBridge } from "../../../modules/conversation/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { MessageMedia } from "./message-media";

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const release of cleanup.splice(0)) await release();
  vi.unstubAllGlobals();
});

async function mount(
  requestImage: NonNullable<HistoryBridge["requestImage"]>,
  count: number,
) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("IntersectionObserver", undefined);
  const threadId = crypto.randomUUID();
  const bridge: HistoryBridge = {
    requestImage,
    cancelRead: async (identity) => ({ kind: "acknowledged", ...identity }),
    read: vi.fn(),
    projectList: vi.fn(),
    projectRead: vi.fn(),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const client = new QueryClient();
  cleanup.push(async () => {
    await act(() => root.unmount());
    client.clear();
    container.remove();
  });
  await act(() =>
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(MessageMedia, {
            bridge,
            threadId,
            entry: {
              id: "images",
              parentId: null,
              role: "user",
              text: "",
              mediaCursor: { threadId, source: "frozen", offset: 1 },
              images: Array.from({ length: count }, (_, index) => ({
                index,
                mimeType: "image/png",
                digest: "a".repeat(64),
                name: `${index}.png`,
              })),
            },
          }),
        }),
      ),
    ),
  );
  return container;
}

it("eventually displays three visible images through two read slots instead of treating busy as missing", async () => {
  let active = 0,
    peak = 0,
    busy = 0;
  const request = vi.fn<NonNullable<HistoryBridge["requestImage"]>>(
    async (command) => {
      const identity = {
        operationId: command.operationId,
        traceId: command.traceId,
      };
      if (active === 2) {
        busy++;
        return {
          kind: "failed",
          error: {
            ...identity,
            code: "busy",
            retryable: true,
            attribution: "main",
          },
        };
      }
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active--;
      return {
        kind: "completed",
        ...identity,
        reply: { kind: "image", dataUrl: "data:image/png;base64,YQ==" },
      };
    },
  );
  const container = await mount(request, 3);
  await act(async () => {
    await vi.waitFor(() =>
      expect(container.querySelectorAll("img")).toHaveLength(3),
    );
  });
  expect(busy).toBeGreaterThan(0);
  expect(peak).toBe(2);
  expect(active).toBe(0);
  expect(request).toHaveBeenCalledTimes(3 + busy);
});

it("stops automatic admission retries and provides an explicit retry after continuing contention", async () => {
  let available = false;
  const request = vi.fn<NonNullable<HistoryBridge["requestImage"]>>(
    async (command) => {
      const identity = {
        operationId: command.operationId,
        traceId: command.traceId,
      };
      return available
        ? {
            kind: "completed",
            ...identity,
            reply: { kind: "image", dataUrl: "data:image/png;base64,YQ==" },
          }
        : {
            kind: "failed",
            error: {
              ...identity,
              code: "busy",
              retryable: true,
              attribution: "main",
            },
          };
    },
  );
  const container = await mount(request, 1);
  await act(async () => {
    await vi.waitFor(
      () =>
        expect(container.querySelector("button")?.textContent).toBe(
          "Check again",
        ),
      { timeout: 3000 },
    );
  });
  expect(request).toHaveBeenCalledTimes(4);
  available = true;
  await act(() =>
    container.querySelector<HTMLButtonElement>("button")?.click(),
  );
  await act(async () => {
    await vi.waitFor(() =>
      expect(container.querySelectorAll("img")).toHaveLength(1),
    );
  });
  expect(request).toHaveBeenCalledTimes(5);
});

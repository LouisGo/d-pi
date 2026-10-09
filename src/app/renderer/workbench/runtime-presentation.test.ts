// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { RuntimeViewSchema } from "../../../modules/execution/contracts/public";
import { RuntimeModel } from "../../../modules/execution/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { RuntimePanel } from "./runtime-panel";

it("does not turn an ordinary running reply into a queue area above the conversation", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const view = RuntimeViewSchema.parse({
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    revision: 0,
    phase: "ready",
    trusted: true,
    busy: true,
    model: "fixture",
    configuration: { code: "runtime.configDefault" },
    message: { code: "runtime.processing" },
    control: {
      paused: false,
      stopping: false,
      pendingAsync: false,
      admitted: false,
      streaming: true,
      compacting: false,
      queued: 0,
      background: 0,
      queue: [],
    },
  });
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async () => ({ kind: "view", view }),
  });
  await model.bind(view.threadId);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(RuntimePanel, {
            model,
            inspection: false,
            onFollowUp: undefined,
          }),
        }),
      ),
    );
    expect(container.querySelector(".runtime-panel")).toBeNull();
  } finally {
    await act(() => root.unmount());
    container.remove();
    model.dispose();
  }
});

it("keeps stop in the composer and dispatches against the current execution identity", async () => {
  const { ComposerStopAction } = await import("./composer-execution-controls");
  const commands: unknown[] = [];
  const threadId = crypto.randomUUID(),
    connectionGeneration = crypto.randomUUID();
  const view = RuntimeViewSchema.parse({
    threadId,
    connectionGeneration,
    traceId: crypto.randomUUID(),
    revision: 1,
    phase: "ready",
    trusted: true,
    busy: true,
    model: "fixture",
    configuration: { code: "runtime.configDefault" },
    message: { code: "runtime.processing" },
    control: {
      paused: false,
      stopping: false,
      pendingAsync: false,
      admitted: false,
      streaming: true,
      compacting: false,
      queued: 0,
      background: 0,
      queue: [],
    },
  });
  const model = new RuntimeModel({
    subscribe: () => () => {},
    request: async (command) => {
      commands.push(command);
      return { kind: "view", view };
    },
  });
  await model.bind(view.threadId);
  commands.length = 0;
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ComposerStopAction, { model }),
        }),
      ),
    );
    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Stop response"]',
    );
    expect(button).not.toBeNull();
    await act(async () => button?.click());
    expect(commands).toContainEqual(
      expect.objectContaining({ kind: "stop", threadId, connectionGeneration }),
    );
  } finally {
    await act(() => root.unmount());
    container.remove();
    model.dispose();
  }
});

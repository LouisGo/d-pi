// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  type RuntimeCommand,
  type RuntimeView,
  RuntimeViewSchema,
} from "../../../modules/execution/contracts/public";
import { RuntimeModel } from "../../../modules/execution/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { QueueControls } from "./queue-controls";

async function mountQueue(
  options: Partial<Parameters<typeof QueueControls>[0]> = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const entryId = crypto.randomUUID();
  let view = RuntimeViewSchema.parse({
    threadId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    revision: 0,
    configuration: { code: "runtime.configDefault" },
    phase: "ready",
    trusted: true,
    busy: true,
    model: "fixture",
    message: { code: "runtime.readyToSend" },
    connectionGeneration: crypto.randomUUID(),
    control: {
      paused: false,
      stopping: false,
      pendingAsync: false,
      admitted: false,
      streaming: true,
      compacting: false,
      queued: 2,
      background: 0,
      queue: [],
      queueState: {
        revision: 0,
        coverage: "complete",
        hiddenCount: 0,
        editing: null,
        items: [
          {
            id: entryId,
            kind: "followUp",
            text: "same",
            editable: true,
            editing: false,
            truncated: false,
          },
          {
            id: crypto.randomUUID(),
            kind: "followUp",
            text: "same",
            editable: false,
            editing: false,
            truncated: false,
          },
        ],
      },
    },
  });
  const commands: RuntimeCommand[] = [];
  let deliver: (view: RuntimeView) => void = () => {};
  const model = new RuntimeModel({
    subscribe: (listener) => {
      deliver = listener;
      return () => {};
    },
    request: async (command) => {
      commands.push(command);
      if (command.kind === "manage-queue" && view.control?.queueState) {
        const snapshot = view.control.queueState;
        const action = command.command;
        const entry = snapshot.items.find((item) => item.id === action.entryId);
        if (!entry) throw Error("foreign fixture entry");
        const editing =
          action.action === "begin-edit"
            ? { entryId: entry.id, draftText: entry.text }
            : action.action === "update-edit"
              ? { entryId: entry.id, draftText: action.text }
              : action.action === "save-edit" || action.action === "cancel-edit"
                ? null
                : snapshot.editing;
        view = {
          ...view,
          revision: view.revision + 1,
          queueOperation: { traceId: command.traceId, status: "acknowledged" },
          control: {
            ...view.control,
            queueState: {
              ...snapshot,
              revision: snapshot.revision + 1,
              editing,
              items: snapshot.items.map((item) => ({
                ...item,
                editing: editing?.entryId === item.id,
                text:
                  action.action === "save-edit" && item.id === action.entryId
                    ? action.text
                    : item.text,
              })),
            },
          },
        };
      }
      return { kind: "view", view };
    },
  });
  await model.bind(view.threadId);
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  const render = () =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
        children: createElement(QueueControls, { model, ...options }),
      }),
    );
  await act(async () => render());
  return {
    element,
    entryId,
    model,
    commands,
    render,
    async hide() {
      await act(async () => root.render(createElement("span")));
    },
    async publish(next: RuntimeView) {
      view = next;
      await act(async () => deliver(next));
    },
    view: () => view,
    async cleanup() {
      await act(async () => root.unmount());
      element.remove();
      model.dispose();
    },
  };
}

it("renders separate native duplicate entries and disables only unsupported editing", async () => {
  const mounted = await mountQueue();
  try {
    const rows = mounted.element.querySelectorAll("[data-queue-entry]");
    expect(rows.length).toBe(2);
    expect(rows[0]?.getAttribute("data-queue-entry")).toBe(mounted.entryId);
    expect(
      rows[0]?.querySelector<HTMLButtonElement>(
        "[data-queue-action=begin-edit]",
      )?.disabled,
    ).toBe(false);
    expect(
      rows[1]?.querySelector<HTMLButtonElement>(
        "[data-queue-action=begin-edit]",
      )?.disabled,
    ).toBe(true);
  } finally {
    await mounted.cleanup();
  }
});

it("edits the addressed native identity, preserves typing across earlier acknowledgements, and saves latest text", async () => {
  const mounted = await mountQueue();
  try {
    const edit = mounted.element.querySelector<HTMLButtonElement>(
      "[data-queue-action=begin-edit]",
    );
    await act(async () => edit?.click());
    const input = mounted.element.querySelector("textarea");
    if (!input) throw Error("missing confirmed editor");
    expect(input.value).toBe("same");
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )?.set?.call(input, "latest edited text");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      mounted.commands
        .filter((command) => command.kind === "manage-queue")
        .map((command) =>
          command.kind === "manage-queue" ? command.command.action : "",
        ),
    ).toEqual(["begin-edit", "update-edit"]);
    expect(
      mounted.model.getSnapshot()?.control?.queueState?.editing?.draftText,
    ).toBe("latest edited text");
    await act(async () =>
      mounted.element
        .querySelector<HTMLButtonElement>("[data-queue-action=save-edit]")
        ?.click(),
    );
    const saved = mounted.commands.at(-1);
    expect(saved?.kind).toBe("manage-queue");
    if (saved?.kind === "manage-queue")
      expect(saved.command).toMatchObject({
        action: "save-edit",
        entryId: mounted.entryId,
        text: "latest edited text",
      });
    expect(mounted.element.querySelector("textarea")).toBe(null);
  } finally {
    await mounted.cleanup();
  }
});

it.each(["中".repeat(90000), "🙂".repeat(70000), '"'.repeat(140000)])(
  "preserves an oversized encoded draft, blocks save, and recovers after shortening %#",
  async (text) => {
    const mounted = await mountQueue();
    try {
      await act(async () =>
        mounted.element
          .querySelector<HTMLButtonElement>("[data-queue-action=begin-edit]")
          ?.click(),
      );
      const input = mounted.element.querySelector("textarea");
      if (!input) throw Error("missing editor");
      const before = mounted.commands.length;
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set?.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(input.value.length).toBe(text.length);
      expect(mounted.commands.length).toBe(before);
      expect(
        mounted.model.getSnapshot()?.control?.queueState?.editing?.draftText,
      ).toBe("same");
      expect(
        mounted.element.querySelector<HTMLButtonElement>(
          "[data-queue-action=save-edit]",
        )?.disabled,
      ).toBe(true);
      expect(
        mounted.element.querySelector<HTMLButtonElement>(
          "[data-queue-action=cancel-edit]",
        )?.disabled,
      ).toBe(false);
      expect(
        mounted.element.querySelector("[role=alert]")?.textContent,
      ).toContain("256 KiB");
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )?.set?.call(input, "缩短");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(mounted.commands.length).toBe(before + 1);
      expect(
        mounted.model.getSnapshot()?.control?.queueState?.editing?.draftText,
      ).toBe("缩短");
      expect(
        mounted.element.querySelector<HTMLButtonElement>(
          "[data-queue-action=save-edit]",
        )?.disabled,
      ).toBe(false);
      expect(mounted.element.querySelector("[role=alert]")).toBeNull();
    } finally {
      await mounted.cleanup();
    }
  },
);

it("shows confirmed host draft after view remount without cancelling native edit", async () => {
  const mounted = await mountQueue();
  try {
    const current = mounted.view();
    if (!current.control?.queueState) throw Error("missing fixture queue");
    await mounted.publish({
      ...current,
      revision: 1,
      control: {
        ...current.control,
        queueState: {
          ...current.control.queueState,
          revision: 1,
          editing: {
            entryId: mounted.entryId,
            draftText: "host retained draft",
          },
          items: current.control.queueState.items.map((entry) => ({
            ...entry,
            editing: entry.id === mounted.entryId,
          })),
        },
      },
    });
    expect(mounted.element.querySelector("textarea")?.value).toBe(
      "host retained draft",
    );
    const commandCount = mounted.commands.length;
    await mounted.hide();
    await act(async () => mounted.render());
    expect(mounted.element.querySelector("textarea")?.value).toBe(
      "host retained draft",
    );
    expect(mounted.commands.length).toBe(commandCount);
  } finally {
    await mounted.cleanup();
  }
});

it("pending and unknown disable writes; unknown offers inspect without retrying the mutation", async () => {
  const mounted = await mountQueue();
  try {
    let current = mounted.view();
    await mounted.publish({
      ...current,
      revision: 1,
      queueOperation: { traceId: crypto.randomUUID(), status: "pending" },
    });
    expect(
      Array.from(
        mounted.element.querySelectorAll<HTMLButtonElement>(
          "[data-queue-action]",
        ),
      ).every((button) => button.disabled),
    ).toBe(true);
    current = mounted.view();
    await mounted.publish({
      ...current,
      revision: 2,
      queueOperation: { traceId: crypto.randomUUID(), status: "unknown" },
    });
    const before = mounted.commands.length;
    await act(async () =>
      mounted.element
        .querySelector<HTMLButtonElement>("[data-queue-action=delete]")
        ?.click(),
    );
    expect(mounted.commands.length).toBe(before);
    const inspect = mounted.element.querySelector<HTMLButtonElement>(
      "button:not([data-queue-action])",
    );
    expect(inspect?.disabled).toBe(false);
    await act(async () => inspect?.click());
    expect(mounted.commands.at(-1)?.kind).toBe("inspect");
    expect(
      mounted.commands.filter((command) => command.kind === "manage-queue"),
    ).toHaveLength(0);
  } finally {
    await mounted.cleanup();
  }
});

it("explicit inspection reconciles native snapshot and restores fresh operation buttons without replay", async () => {
  const mounted = await mountQueue();
  try {
    const current = mounted.view();
    await mounted.publish({
      ...current,
      revision: 1,
      queueOperation: { traceId: crypto.randomUUID(), status: "unknown" },
    });
    expect(
      mounted.element.querySelector<HTMLButtonElement>(
        "[data-queue-action=begin-edit]",
      )?.disabled,
    ).toBe(true);
    const count = mounted.commands.length;
    await mounted.publish({
      ...current,
      revision: 2,
      queueOperation: {
        traceId: crypto.randomUUID(),
        status: "unknown",
        reconciled: true,
      },
    });
    await act(async () =>
      mounted.element
        .querySelector<HTMLButtonElement>("button:not([data-queue-action])")
        ?.click(),
    );
    expect(
      mounted.commands.slice(count).map((command) => command.kind),
    ).toEqual(["inspect"]);
    expect(
      mounted.element.querySelector<HTMLButtonElement>(
        "[data-queue-action=begin-edit]",
      )?.disabled,
    ).toBe(false);
    expect(mounted.model.getSnapshot()?.queueOperation?.status).toBe("unknown");
    await act(async () =>
      mounted.element
        .querySelector<HTMLButtonElement>("[data-queue-action=begin-edit]")
        ?.click(),
    );
    expect(mounted.commands.at(-1)?.kind).toBe("manage-queue");
  } finally {
    await mounted.cleanup();
  }
});

it("allows image-only queue edits and only removes a native image through an explicit selection", async () => {
  const mounted = await mountQueue();
  try {
    const view = mounted.view();
    const queue = view.control?.queueState;
    if (!view.control || !queue) throw Error("fixture");
    const imageId = crypto.randomUUID();
    await mounted.publish({
      ...view,
      control: {
        ...view.control,
        queueState: {
          ...queue,
          editing: {
            entryId: mounted.entryId,
            draftText: "",
            retainedImageIds: [imageId],
          },
          items: queue.items.map((entry) =>
            entry.id === mounted.entryId
              ? {
                  ...entry,
                  text: "",
                  editing: true,
                  images: [{ id: imageId, mimeType: "image/png" }],
                  imageCount: 1,
                }
              : entry,
          ),
        },
      },
    });
    const save = mounted.element.querySelector<HTMLButtonElement>(
      "[data-queue-action=save-edit]",
    );
    expect(save?.disabled).toBe(false);
    const retain = mounted.element.querySelector<HTMLInputElement>(
      "input[type=checkbox]",
    );
    expect(retain?.checked).toBe(true);
    await act(async () => retain?.click());
    expect(save?.disabled).toBe(true);
    await act(async () => retain?.click());
    await act(async () => save?.click());
    expect(mounted.commands.at(-1)).toMatchObject({
      kind: "manage-queue",
      command: { action: "save-edit", text: "", retainedImageIds: [imageId] },
    });
  } finally {
    await mounted.cleanup();
  }
});

it("hides an acknowledged empty queue in the composer and keeps paused messages explicitly resumable", async () => {
  const mounted = await mountQueue({
    hiddenEmpty: true,
    placement: "composer",
  });
  try {
    const original = mounted.view();
    if (!original.control?.queueState) throw Error("missing queue");
    await mounted.publish({
      ...original,
      control: { ...original.control, paused: true },
    });
    const resume = mounted.element.querySelector<HTMLButtonElement>(
      'button[aria-label="继续发送"]',
    );
    expect(resume).not.toBeNull();
    await act(async () => resume?.click());
    expect(mounted.commands).toContainEqual(
      expect.objectContaining({
        kind: "continue",
        connectionGeneration: original.connectionGeneration,
      }),
    );
    await mounted.publish({
      ...original,
      revision: 5,
      queueOperation: { traceId: crypto.randomUUID(), status: "acknowledged" },
      control: {
        ...original.control,
        queued: 0,
        queueState: { ...original.control.queueState, items: [] },
      },
    });
    expect(mounted.element.querySelector(".composer-queue")).toBeNull();
  } finally {
    await mounted.cleanup();
  }
});

// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type {
  Interaction,
  RuntimeView,
} from "../../../modules/execution/contracts/public";
import { RuntimeModel } from "../../../modules/execution/renderer/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadIdSchema } from "../../../shared/identity";
import { NativeInteraction } from "./native-interaction";

const item: Interaction = {
  id: "question",
  method: "select",
  title: "选择处理方式",
  options: ["继续", "稍后处理"],
  optionDetails: [{ description: "保留现有配置" }],
  status: "pending",
  expiresAt: null,
};

async function typeAnswer(host: HTMLElement, text: string) {
  const input = host.querySelector<HTMLTextAreaElement>(
    'textarea[aria-label="其他回答"]',
  );
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set?.call(input, text);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function setup(initial: Interaction = item, trusted = true) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const answer = vi.fn();
  const connectionGeneration = crypto.randomUUID();
  let revision = 0;
  let current: RuntimeView = {
    threadId: ThreadIdSchema.parse(crypto.randomUUID()),
    traceId: crypto.randomUUID(),
    connectionGeneration,
    configuration: { code: "runtime.configDefault" },
    revision,
    phase: "ready",
    trusted,
    busy: false,
    model: "fixture",
    message: { code: "runtime.readyToSend" },
    interactions: {
      connectionGeneration,
      unsupported: false,
      items: [initial],
    },
  };
  let deliver: (view: RuntimeView) => void = () => {};
  const model = new RuntimeModel({
    subscribe: (listener) => {
      deliver = listener;
      return () => {};
    },
    request: async (command) => {
      if (command.kind === "answer") {
        answer(command.id, command.answer);
        return {
          kind: "view",
          view: {
            ...current,
            revision: ++revision,
            interactionOperations: [
              {
                operationId: command.traceId,
                threadId: command.threadId,
                connectionGeneration,
                requestId: command.id,
                kind: "answer",
                status: "written",
              },
            ],
          },
        };
      }
      return { kind: "view", view: current };
    },
  });
  await model.bind(current.threadId);
  const render = async (next: Interaction) =>
    act(() => {
      current = {
        ...current,
        revision: ++revision,
        interactions: {
          connectionGeneration,
          unsupported: false,
          items: [next],
        },
      };
      deliver(current);
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
          children: createElement(NativeInteraction, {
            item: next,
            model,
            available: true,
            trusted,
            onFollowUp: undefined,
            onContinueFollowUp: undefined,
            receiptsById: new Map(),
            followUpIds: [],
          }),
        }),
      );
    });
  await render(initial);
  const button = (text: string) =>
    [...host.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) =>
        node.textContent === text || node.getAttribute("aria-label") === text,
    )!;
  return {
    host,
    answer,
    button,
    render,
    model,
    remount: async () => {
      await act(() => root.render(null));
      await render(current.interactions!.items[0]!);
    },
    cleanup: async () => {
      await act(() => root.unmount());
      model.dispose();
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

it("selects locally, then submits the exact native option once", async () => {
  const view = await setup();
  try {
    expect(view.button("发送回答").disabled).toBe(true);
    const option = view.host.querySelector<HTMLElement>(
      '[role="radio"][aria-label="继续"]',
    );
    expect(option).not.toBeNull();
    await act(() => option?.click());
    expect(view.answer).not.toHaveBeenCalled();
    expect(option?.getAttribute("aria-checked")).toBe("true");
    const description = option?.getAttribute("aria-describedby");
    expect(document.getElementById(description ?? "")?.textContent).toBe(
      "保留现有配置",
    );
    await act(async () => {
      view.button("发送回答").click();
      view.button("发送回答").click();
    });
    expect(view.answer).toHaveBeenCalledExactlyOnceWith("question", {
      kind: "value",
      value: "继续",
    });
  } finally {
    await view.cleanup();
  }
});

it("does not submit a different option when native options change after selection", async () => {
  const view = await setup();
  try {
    await act(() =>
      view.host
        .querySelector<HTMLElement>('[role="radio"][aria-label="继续"]')
        ?.click(),
    );
    await view.render({ ...item, options: ["删除", "稍后处理"] });
    expect(view.button("发送回答").disabled).toBe(true);
    await act(async () => view.button("发送回答").click());
    expect(view.answer).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});

it("retains cancellation without execution trust and disables native choices", async () => {
  const view = await setup(item, false);
  try {
    expect(
      view.host.querySelector('[role="radio"]')?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(view.button("发送回答").disabled).toBe(true);
    await act(async () => view.button("取消回答").click());
    expect(view.answer).toHaveBeenCalledExactlyOnceWith("question", {
      kind: "cancel",
    });
  } finally {
    await view.cleanup();
  }
});

it("expires a locally selected answer without dispatching it", async () => {
  const view = await setup();
  try {
    const option = view.host.querySelector<HTMLElement>('[role="radio"]');
    expect(option).not.toBeNull();
    await act(() => option?.click());
    await view.render({ ...item, status: "expired" });
    expect(view.host.querySelector('[role="radiogroup"]')).toBeNull();
    expect(view.host.querySelector('[role="status"]')?.textContent).toContain(
      "超时",
    );
    expect(view.answer).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});

it("moves the choice with arrow keys without submitting", async () => {
  const view = await setup();
  try {
    const first = view.host.querySelector<HTMLElement>(
      '[role="radio"][aria-label="继续"]',
    )!;
    await act(async () => {
      first.focus();
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    const next = view.host.querySelector<HTMLElement>(
      '[role="radio"][aria-label="稍后处理"]',
    );
    expect(document.activeElement).toBe(next);
    expect(next?.getAttribute("aria-checked")).toBe("true");
    expect(view.answer).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});

it.each(["确认", "拒绝"])(
  "retains the native confirmation response for %s",
  async (label) => {
    const view = await setup({ ...item, method: "confirm" });
    try {
      await act(async () => view.button(label).click());
      expect(view.answer).toHaveBeenCalledExactlyOnceWith("question", {
        kind: "confirm",
        confirmed: label === "确认",
      });
    } finally {
      await view.cleanup();
    }
  },
);

it("retains the original input prefill when submitted", async () => {
  const view = await setup({
    ...item,
    method: "input",
    prefill: "原生预填内容",
  });
  try {
    expect(view.host.querySelector("textarea")?.value).toBe("原生预填内容");
    await act(async () => view.button("发送回答").click());
    expect(view.answer).toHaveBeenCalledExactlyOnceWith("question", {
      kind: "value",
      value: "原生预填内容",
    });
  } finally {
    await view.cleanup();
  }
});

it("allows a single native option without selecting it automatically", async () => {
  const view = await setup({ ...item, options: ["唯一选项"] });
  try {
    expect(view.button("发送回答").disabled).toBe(true);
    await act(() =>
      view.host
        .querySelector<HTMLElement>('[role="radio"][aria-label="唯一选项"]')
        ?.click(),
    );
    await act(async () => view.button("发送回答").click());
    expect(view.answer).toHaveBeenCalledExactlyOnceWith("question", {
      kind: "value",
      value: "唯一选项",
    });
  } finally {
    await view.cleanup();
  }
});

it("submits custom text unchanged and only once after clearing the selected option", async () => {
  const view = await setup();
  try {
    await act(() =>
      view.host
        .querySelector<HTMLElement>('[role="radio"][aria-label="继续"]')
        ?.click(),
    );
    const text = "  我想先检查配置\n再继续执行  ";
    await typeAnswer(view.host, text);
    expect(
      view.host.querySelector('[role="radio"][aria-checked="true"]'),
    ).toBeNull();
    expect(view.answer).not.toHaveBeenCalled();
    expect(view.button("发送回答").disabled).toBe(false);
    await act(async () => {
      view.button("发送回答").click();
      view.button("发送回答").click();
    });
    expect(view.answer).toHaveBeenCalledExactlyOnceWith("question", {
      kind: "value",
      value: text,
    });
  } finally {
    await view.cleanup();
  }
});

it("clears custom text when returning to a predefined option", async () => {
  const view = await setup();
  try {
    await typeAnswer(view.host, "其他处理方式");
    await act(() =>
      view.host
        .querySelector<HTMLElement>('[role="radio"][aria-label="稍后处理"]')
        ?.click(),
    );
    expect(view.host.querySelector("textarea")?.value).toBe("");
    await act(async () => view.button("发送回答").click());
    expect(view.answer).toHaveBeenCalledExactlyOnceWith("question", {
      kind: "value",
      value: "稍后处理",
    });
  } finally {
    await view.cleanup();
  }
});

it("keeps whitespace-only custom answers disabled", async () => {
  const view = await setup();
  try {
    await typeAnswer(view.host, " \n  ");
    expect(view.button("发送回答").disabled).toBe(true);
    await act(async () => view.button("发送回答").click());
    expect(view.answer).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});

it("disables free text without trust and retains the native confirmation protocol", async () => {
  const view = await setup(item, false);
  try {
    expect(view.host.querySelector("textarea")?.disabled).toBe(true);
  } finally {
    await view.cleanup();
  }
  const confirmation = await setup({ ...item, method: "confirm" });
  try {
    expect(confirmation.host.querySelector("textarea")).toBeNull();
  } finally {
    await confirmation.cleanup();
  }
});

it("retains a half-written custom answer for follow-up after timeout defaulting", async () => {
  const view = await setup();
  try {
    await typeAnswer(view.host, "保留我尚未提交的回答");
    await view.render({ ...item, status: "written", defaultAnswered: true });
    expect(view.host.querySelector("textarea")?.value).toBe(
      "保留我尚未提交的回答",
    );
    expect(view.answer).not.toHaveBeenCalled();
  } finally {
    await view.cleanup();
  }
});

it("restores an unfinished answer and dispatched lock after the card remounts", async () => {
  const view = await setup();
  try {
    await typeAnswer(view.host, "保留草稿");
    await view.remount();
    expect(view.host.querySelector("textarea")?.value).toBe("保留草稿");
    await act(async () => view.button("发送回答").click());
    await view.remount();
    expect(view.host.querySelector('[role="radiogroup"]')).toBeNull();
    expect(view.host.textContent).toContain("已写入");
    expect(view.answer).toHaveBeenCalledOnce();
  } finally {
    await view.cleanup();
  }
});

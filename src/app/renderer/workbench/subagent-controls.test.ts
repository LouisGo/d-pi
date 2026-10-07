// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import type {
  ConfigurationBridge,
  ConfigurationSnapshot,
} from "../../../modules/configuration/contracts/public";
import {
  type RuntimeCommand,
  type RuntimeView,
  RuntimeViewSchema,
} from "../../../modules/execution/contracts/public";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { createI18n } from "../../../shared/i18n/create-i18n";
import type { DesktopBridge } from "../../contracts/desktop-bridge";
import { failure } from "../../contracts/failure";
import { ThreadModel } from "../wiring/thread-model";
import { SubagentControls } from "./subagent-controls";

function deferred() {
  let resolve: () => void = () => {
    throw Error("Deferred not initialized");
  };
  let reject: (reason?: unknown) => void = () => {
    throw Error("Deferred not initialized");
  };
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const capabilities = (
  efforts: ConfigurationSnapshot["models"][number]["thinking"]["efforts"],
  requiresEffort = false,
) => ({
  efforts,
  adjustable: efforts.length > 0,
  requiresEffort,
  defaultEffort: null,
  defaultLevel: null,
});
const catalog: ConfigurationSnapshot["models"] = [
  {
    provider: "fixture",
    id: "minimal",
    name: "Minimal",
    available: true,
    reason: null,
    reasoning: true,
    input: ["text"],
    thinking: capabilities(["minimal", "low"]),
  },
  {
    provider: "fixture",
    id: "required",
    name: "Required",
    available: true,
    reason: null,
    reasoning: true,
    input: ["text"],
    thinking: capabilities(["low", "high"], true),
  },
  {
    provider: "fixture",
    id: "fixed",
    name: "Fixed",
    available: true,
    reason: null,
    reasoning: false,
    input: ["text"],
    thinking: capabilities([]),
  },
];
async function setup(client = new QueryClient()) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const draft = DraftSchema.parse({
    schemaVersion: 1,
    threadId: crypto.randomUUID(),
    workingDirectoryId: crypto.randomUUID(),
    directory: "/fixture",
    revision: 0,
    text: "",
  });
  let view: RuntimeView = {
    ...RuntimeViewSchema.parse({
      threadId: draft.threadId,
      traceId: crypto.randomUUID(),
      configuration: { code: "runtime.configDefault" },
      revision: 0,
      phase: "ready",
      trusted: true,
      busy: true,
      model: "fixture/minimal",
      connectionGeneration: crypto.randomUUID(),
      message: { code: "runtime.readyToSend" },
    }),
    subagents: {
      agents: [
        {
          name: "worker",
          description: "Fixture worker",
          override: null,
          effectivePatterns: ["fixture/minimal"],
        },
        {
          name: "reviewer",
          description: "Fixture reviewer",
          override: null,
          effectivePatterns: ["fixture/required"],
        },
      ],
    },
  };
  const commands: RuntimeCommand[] = [];
  let heldConfiguration: Promise<void> | null = null;
  let listener: ((value: RuntimeView) => void) | undefined;
  const desktop: DesktopBridge = {
    request: async () => {
      throw Error("unused");
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
    runtime: {
      subscribe: (next) => {
        listener = next;
        return () => {
          listener = undefined;
        };
      },
      request: async (command) => {
        commands.push(command);
        if (command.kind === "configure-subagent") {
          if (heldConfiguration) {
            const held = heldConfiguration;
            heldConfiguration = null;
            await held;
          }
          const intent = command.command;
          view = {
            ...view,
            revision: view.revision + 1,
            subagentOperation: {
              traceId: command.traceId,
              status: "acknowledged",
            },
            subagents: {
              agents: (view.subagents?.agents ?? []).map((agent) =>
                agent.name === intent.agent
                  ? {
                      ...agent,
                      override:
                        intent.kind === "clear"
                          ? null
                          : {
                              provider: intent.provider,
                              modelId: intent.modelId,
                              thinking: intent.thinking,
                            },
                    }
                  : agent,
              ),
            },
          };
        }
        return { kind: "view", view };
      },
    },
  };
  const thread = new ThreadModel(
    draft,
    desktop,
    (traceId) =>
      failure(traceId, "transport-unavailable", "draft.transportUnknown").error,
  );
  const scopes: unknown[] = [];
  const bridge: ConfigurationBridge = {
    subscribe: () => () => {},
    request: async (command) => {
      if (command.kind !== "snapshot") throw Error("unexpected");
      scopes.push(command.scope);
      return {
        kind: "snapshot",
        scope: command.scope,
        traceId: command.traceId,
        source: { directory: "/native", profile: null, cwd: draft.directory },
        models: catalog,
        defaultModel: null,
        openaiAuthenticated: false,
        deepseekAuthenticated: false,
        catalogError: false,
        coverage: "complete",
        issues: [],
      };
    },
  };
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client },
        createElement(I18nProvider, {
          initialSnapshot: { preference: "zh-CN", resolvedLocale: "zh-CN" },
          children: createElement(SubagentControls, { thread, bridge }),
        }),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return {
    holdConfiguration: () => {
      const held = deferred();
      heldConfiguration = held.promise;
      return held;
    },
    element,
    thread,
    client,
    commands,
    scopes,
    update: async (patch: Partial<typeof view>) => {
      await act(async () => {
        view = { ...view, ...patch, revision: view.revision + 1 };
        listener?.(view);
      });
    },
    dispose: async () => {
      await act(async () => root.unmount());
      thread.dispose();
      client.clear();
      element.remove();
    },
  };
}
function select(element: HTMLElement, field: string) {
  const control = element.querySelector<HTMLButtonElement>(
    `button[name="${field}"]`,
  );
  if (!control) throw Error(`missing ${field} control`);
  return control;
}
async function change(control: HTMLButtonElement, value: string) {
  await act(() => control.click());
  const item = Array.from(
    document.querySelectorAll<HTMLElement>("[role=option]"),
  ).find((el) => el.dataset.value === value);
  if (!item) throw Error(`missing option ${value}`);
  await act(() => item.click());
}

it("keeps future subagent configuration available during a trusted live Thread's main execution", async () => {
  const h = await setup();
  try {
    expect(h.element.querySelector("details")).not.toBeNull();
    expect(h.element.querySelector("details")?.open).toBe(false);
    expect(select(h.element, "subagent-agent").value).toBe("worker");
    expect(h.element.textContent).toContain("Fixture worker");
    await change(
      select(h.element, "subagent-model"),
      JSON.stringify(["fixture", "minimal"]),
    );
    expect(
      h.element.querySelector<HTMLButtonElement>("button[data-action='apply']")
        ?.disabled,
    ).toBe(false);
    expect(h.scopes).toEqual([
      {
        kind: "thread",
        threadId: h.thread.context.threadId,
        workingDirectoryId: h.thread.context.workingDirectoryId,
      },
    ]);
  } finally {
    await h.dispose();
  }
});

it("shows native operation uncertainty and disables all writes while the update is pending", async () => {
  const h = await setup();
  try {
    await change(
      select(h.element, "subagent-model"),
      JSON.stringify(["fixture", "minimal"]),
    );
    await h.update({
      subagentOperation: { traceId: crypto.randomUUID(), status: "pending" },
    });
    expect(
      h.element.querySelector<HTMLButtonElement>("button[data-action='apply']")
        ?.disabled,
    ).toBe(true);
    expect(select(h.element, "subagent-agent").disabled).toBe(true);
    expect(h.element.querySelector("[role='status']")?.textContent).toContain(
      createI18n("zh-CN").t("subagent.pending"),
    );
    await h.update({
      subagentOperation: { traceId: crypto.randomUUID(), status: "unknown" },
    });
    expect(h.element.querySelector("[role='alert']")?.textContent).toContain(
      createI18n("zh-CN").t("subagent.unknown"),
    );
    await h.update({
      subagentOperation: {
        traceId: crypto.randomUUID(),
        status: "failed",
        code: "model-unavailable",
      },
    });
    expect(h.element.querySelector("[role='alert']")?.textContent).toContain(
      createI18n("zh-CN").t("subagent.failed"),
    );
  } finally {
    await h.dispose();
  }
});

it("does not carry a removed agent's unsaved model choice into a different native agent", async () => {
  const h = await setup();
  try {
    await change(select(h.element, "subagent-agent"), "reviewer");
    await change(
      select(h.element, "subagent-model"),
      JSON.stringify(["fixture", "required"]),
    );
    await h.update({
      subagents: {
        agents: [
          {
            name: "worker",
            description: "Fixture worker",
            override: null,
            effectivePatterns: ["fixture/minimal"],
          },
        ],
      },
    });
    expect(select(h.element, "subagent-agent").value).toBe("worker");
    expect(select(h.element, "subagent-model").value).toBe("");
    expect(
      h.element.querySelector<HTMLButtonElement>("button[data-action='apply']")
        ?.disabled,
    ).toBe(true);
  } finally {
    await h.dispose();
  }
});

it("uses the selected subagent model's native efforts and requires an explicit valid choice after metadata changes", async () => {
  const h = await setup();
  try {
    const model = select(h.element, "subagent-model");
    const thinking = select(h.element, "subagent-thinking");
    const options = async () => await optionValues(thinking);
    await change(model, JSON.stringify(["fixture", "required"]));
    expect(await options()).toEqual(["default", "low", "high"]);
    await change(model, JSON.stringify(["fixture", "fixed"]));
    expect(thinking.disabled).toBe(true);
    expect(await options()).toEqual(["default"]);
    await change(model, JSON.stringify(["fixture", "minimal"]));
    expect(await options()).toEqual(["default", "off", "minimal", "low"]);
    await change(thinking, "minimal");
    await act(async () => {
      h.client.setQueryData<ConfigurationSnapshot>(
        [
          "configuration",
          {
            kind: "thread",
            threadId: h.thread.context.threadId,
            workingDirectoryId: h.thread.context.workingDirectoryId,
          },
        ],
        (previous) =>
          previous
            ? {
                ...previous,
                models: previous.models.map((m) =>
                  m.id === "minimal"
                    ? { ...m, thinking: capabilities(["low"]) }
                    : m,
                ),
              }
            : previous,
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(await options()).toEqual(["default", "off", "low"]);
    expect(
      h.element.querySelector<HTMLButtonElement>("button[data-action='apply']")
        ?.disabled,
    ).toBe(true);
    await change(thinking, "default");
    expect(
      h.element.querySelector<HTMLButtonElement>("button[data-action='apply']")
        ?.disabled,
    ).toBe(false);
  } finally {
    await h.dispose();
  }
});

it.each([
  { phase: "interrupted" as const },
  { trusted: false },
  { connectionGeneration: undefined },
])(
  "prevents writes outside a live trusted execution connection: %j",
  async (patch) => {
    const h = await setup();
    try {
      await change(
        select(h.element, "subagent-model"),
        JSON.stringify(["fixture", "minimal"]),
      );
      await h.update(patch);
      expect(select(h.element, "subagent-model").disabled).toBe(true);
      expect(
        h.element.querySelector<HTMLButtonElement>(
          "button[data-action='apply']",
        )?.disabled,
      ).toBe(true);
      expect(h.element.querySelector("[role='status']")?.textContent).toContain(
        createI18n("zh-CN").t("subagent.unavailable"),
      );
      expect(
        h.commands.filter((command) => command.kind !== "inspect"),
      ).toHaveLength(0);
    } finally {
      await h.dispose();
    }
  },
);

it("isolates model drafts and configuration query identities between two live Threads", async () => {
  const client = new QueryClient();
  const a = await setup(client);
  const b = await setup(client);
  try {
    await change(select(a.element, "subagent-agent"), "reviewer");
    await change(
      select(a.element, "subagent-model"),
      JSON.stringify(["fixture", "required"]),
    );
    expect(select(b.element, "subagent-agent").value).toBe("worker");
    expect(select(b.element, "subagent-model").value).toBe("");
    expect(a.scopes).toEqual([
      {
        kind: "thread",
        threadId: a.thread.context.threadId,
        workingDirectoryId: a.thread.context.workingDirectoryId,
      },
    ]);
    expect(b.scopes).toEqual([
      {
        kind: "thread",
        threadId: b.thread.context.threadId,
        workingDirectoryId: b.thread.context.workingDirectoryId,
      },
    ]);
    expect(a.thread.context.threadId).not.toBe(b.thread.context.threadId);
  } finally {
    await b.dispose();
    await a.dispose();
  }
});

it("sends agent-scoped default, off and effort overrides and clears only that instance through the real RuntimeModel", async () => {
  const h = await setup();
  try {
    const model = select(h.element, "subagent-model");
    const thinking = select(h.element, "subagent-thinking");
    const button = (action: string) =>
      h.element.querySelector<HTMLButtonElement>(
        `button[data-action='${action}']`,
      );
    await change(model, JSON.stringify(["fixture", "minimal"]));
    await act(async () => button("apply")?.click());
    await change(thinking, "off");
    await act(async () => button("apply")?.click());
    await change(thinking, "minimal");
    await act(async () => button("apply")?.click());
    const sent = h.commands.filter(
      (command) => command.kind === "configure-subagent",
    );
    expect(sent.map((command) => command.command)).toEqual([
      {
        kind: "set",
        agent: "worker",
        provider: "fixture",
        modelId: "minimal",
        thinking: { kind: "default" },
      },
      {
        kind: "set",
        agent: "worker",
        provider: "fixture",
        modelId: "minimal",
        thinking: { kind: "off" },
      },
      {
        kind: "set",
        agent: "worker",
        provider: "fixture",
        modelId: "minimal",
        thinking: { kind: "effort", effort: "minimal" },
      },
    ]);
    expect(
      sent.every(
        (command) =>
          command.threadId === h.thread.context.threadId &&
          !!command.connectionGeneration,
      ),
    ).toBe(true);
    expect(button("clear")?.disabled).toBe(false);
    await act(async () => button("clear")?.click());
    const last = h.commands.at(-1);
    expect(last?.kind === "configure-subagent" ? last.command : null).toEqual({
      kind: "clear",
      agent: "worker",
    });
    expect(button("clear")?.disabled).toBe(true);
    expect(
      h.thread.runtime?.getSnapshot()?.subagents?.agents[0]?.override,
    ).toBeNull();
    expect(h.element.textContent).toContain(
      createI18n("zh-CN").t("subagent.inherited"),
    );
  } finally {
    await h.dispose();
  }
});

it("explains an empty model catalog while keeping an existing override clearable", async () => {
  const h = await setup();
  try {
    await h.update({
      subagents: {
        agents: [
          {
            name: "worker",
            description: "Fixture worker",
            override: {
              provider: "fixture",
              modelId: "minimal",
              thinking: { kind: "default" },
            },
            effectivePatterns: ["fixture/minimal"],
          },
        ],
      },
    });
    await act(async () => {
      h.client.setQueryData<ConfigurationSnapshot>(
        [
          "configuration",
          {
            kind: "thread",
            threadId: h.thread.context.threadId,
            workingDirectoryId: h.thread.context.workingDirectoryId,
          },
        ],
        (previous) => (previous ? { ...previous, models: [] } : previous),
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(h.element.textContent).toContain(
      createI18n("zh-CN").t("model.noAvailable"),
    );
    expect(
      h.element.querySelector<HTMLButtonElement>("button[data-action='apply']")
        ?.disabled,
    ).toBe(true);
    expect(
      h.element.querySelector<HTMLButtonElement>("button[data-action='clear']")
        ?.disabled,
    ).toBe(false);
  } finally {
    await h.dispose();
  }
});

it("sends one configuration command for repeated clicks while the native response is pending", async () => {
  const h = await setup();
  try {
    await change(
      select(h.element, "subagent-model"),
      JSON.stringify(["fixture", "minimal"]),
    );
    const held = h.holdConfiguration();
    const apply = h.element.querySelector<HTMLButtonElement>(
      "button[data-action='apply']",
    );
    await act(async () => {
      apply?.click();
      apply?.click();
    });
    expect(
      h.commands.filter((command) => command.kind === "configure-subagent"),
    ).toHaveLength(1);
    expect(apply?.disabled).toBe(true);
    expect(select(h.element, "subagent-thinking").disabled).toBe(true);
    await act(async () => held.resolve());
    expect(apply?.disabled).toBe(false);
    expect(h.thread.runtime?.getSnapshot()?.subagentOperation?.status).toBe(
      "acknowledged",
    );
  } finally {
    await h.dispose();
  }
});

it("keeps a selected model available for inspection when a response is lost and never resends automatically", async () => {
  const h = await setup();
  try {
    await change(
      select(h.element, "subagent-model"),
      JSON.stringify(["fixture", "minimal"]),
    );
    const held = h.holdConfiguration();
    await act(async () =>
      h.element
        .querySelector<HTMLButtonElement>("button[data-action='apply']")
        ?.click(),
    );
    await act(async () => held.reject(Error("response lost")));
    expect(h.thread.runtime?.getSnapshot()?.subagentOperation?.status).toBe(
      "unknown",
    );
    expect(h.element.querySelector("[role='alert']")?.textContent).toContain(
      createI18n("zh-CN").t("subagent.unknown"),
    );
    expect(select(h.element, "subagent-model").value).toBe(
      JSON.stringify(["fixture", "minimal"]),
    );
    expect(
      h.commands.filter((command) => command.kind === "configure-subagent"),
    ).toHaveLength(1);
    expect(
      h.thread.runtime?.getSnapshot()?.subagents?.agents[0]?.override,
    ).toBeNull();
  } finally {
    await h.dispose();
  }
});

it("refreshes native subagent state and the same Thread's model catalog without changing configuration", async () => {
  const h = await setup();
  try {
    const refresh = Array.from(h.element.querySelectorAll("button")).find(
      (button) =>
        button.textContent === createI18n("zh-CN").t("config.refresh"),
    );
    await act(async () => refresh?.click());
    expect(
      h.commands.filter((command) => command.kind === "inspect"),
    ).toHaveLength(2);
    expect(
      h.commands.filter((command) => command.kind === "configure-subagent"),
    ).toHaveLength(0);
    expect(h.scopes).toHaveLength(2);
  } finally {
    await h.dispose();
  }
});

it("blocks new subagent writes until an unknown operation has been checked against native state", async () => {
  const h = await setup();
  try {
    const agents = h.thread.runtime?.getSnapshot()?.subagents?.agents ?? [];
    await h.update({
      subagents: {
        agents: agents.map((agent) => ({
          ...agent,
          override: {
            provider: "fixture",
            modelId: "minimal",
            thinking: { kind: "default" },
          },
        })),
      },
      subagentOperation: { traceId: crypto.randomUUID(), status: "unknown" },
    });
    const apply = h.element.querySelector<HTMLButtonElement>(
      "button[data-action='apply']",
    );
    const clear = h.element.querySelector<HTMLButtonElement>(
      "button[data-action='clear']",
    );
    const refresh = Array.from(h.element.querySelectorAll("button")).find(
      (button) =>
        button.textContent === createI18n("zh-CN").t("config.refresh"),
    );
    expect(apply?.disabled).toBe(true);
    expect(clear?.disabled).toBe(true);
    expect(select(h.element, "subagent-model").disabled).toBe(true);
    expect(refresh?.disabled).toBe(false);
    await act(async () => {
      apply?.click();
      clear?.click();
    });
    expect(
      h.commands.filter((command) => command.kind === "configure-subagent"),
    ).toHaveLength(0);
    await h.update({
      subagentOperation: {
        traceId: crypto.randomUUID(),
        status: "unknown",
        reconciled: true,
      },
    });
    expect(apply?.disabled).toBe(false);
    expect(clear?.disabled).toBe(false);
    expect(select(h.element, "subagent-model").disabled).toBe(false);
    expect(h.thread.runtime?.getSnapshot()?.subagentOperation?.status).toBe(
      "unknown",
    );
    expect(h.element.querySelector("[role='alert']")).toBeNull();
    expect(h.element.querySelector("[role='status']")?.textContent).toContain(
      createI18n("zh-CN").t("subagent.reconciled"),
    );
  } finally {
    await h.dispose();
  }
});

async function optionValues(control: HTMLButtonElement) {
  if (control.disabled) return ["default"];
  await act(() => control.click());
  const values = Array.from(
    document.querySelectorAll<HTMLElement>("[role=option]"),
  ).map((el) => el.dataset.value);
  await act(() =>
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  return values;
}

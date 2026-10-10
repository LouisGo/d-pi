// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { DraftSchema } from "../../../modules/input/contracts/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadContextSchema } from "../../../modules/threads/contracts/public";
import { parseDesktopReply } from "../../contracts/desktop-bridge";
import { AppModel } from "../wiring/model";
import { ProjectThreads } from "./project-threads";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
it("keeps controls and sibling rows stable through persisted project and section collapse", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { emptySidebarPreferences, updateSidebar } = await import(
    "../../../modules/preferences/core/public"
  );
  const rows = [1, 2].map((id) =>
    ThreadContextSchema.parse({
      threadId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      workingDirectoryId: `00000000-0000-4000-8000-${String(id + 70).padStart(12, "0")}`,
      directory: `/project-${id}`,
      title: `Thread ${id}`,
    }),
  );
  let snapshot = { revision: 1, value: emptySidebarPreferences() };
  let release = () => {};
  const model = new AppModel({
    request: async (command) => {
      if (command.kind !== "sidebar-change") throw Error("unexpected request");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      snapshot = {
        revision: snapshot.revision + 1,
        value: updateSidebar(snapshot.value, command.change),
      };
      return parseDesktopReply(command, {
        kind: "sidebar",
        traceId: command.traceId,
        snapshot,
      });
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  });
  model.sidebar.accept(snapshot);
  model.threadListStore.setState({
    threads: rows,
    pending: false,
    failed: false,
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ProjectThreads, { model }),
        }),
      ),
    );
    const groups = [...container.querySelectorAll("[data-project-group]")];
    const initialRows = [
      ...container.querySelectorAll("[data-thread-navigation]"),
    ];
    const controls = [
      ...container.querySelectorAll<HTMLButtonElement>("button"),
    ].filter((b) => !b.disabled);
    const toggle = groups[0]?.querySelector<HTMLButtonElement>(
      "[data-project-toggle]",
    );
    if (!toggle) throw Error("missing toggle");
    await act(async () => {
      toggle.click();
      await Promise.resolve();
    });
    expect(model.sidebar.stateStore.getState().pending).toBe(true);
    expect(
      controls.every((button) => button.isConnected && !button.disabled),
    ).toBe(true);
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect([...container.querySelectorAll("[data-thread-navigation]")]).toEqual(
      initialRows,
    );
    expect(
      groups[0]?.querySelector<HTMLElement>(".sidebar-project-children")
        ?.hidden,
    ).toBe(true);
    expect(
      groups[1]?.querySelector<HTMLElement>(".sidebar-project-children")
        ?.hidden,
    ).toBe(false);
    const sectionToggle = container.querySelector<HTMLButtonElement>(
      ".sidebar-section-heading button",
    );
    if (!sectionToggle) throw Error("missing section toggle");
    await act(async () => {
      sectionToggle.click();
      await Promise.resolve();
    });
    expect(
      controls.every((button) => button.isConnected && !button.disabled),
    ).toBe(true);
    await act(async () => {
      release();
      await Promise.resolve();
    });
    expect([...container.querySelectorAll("[data-thread-navigation]")]).toEqual(
      initialRows,
    );
    expect(
      container.querySelector<HTMLElement>(
        `#${CSS.escape(sectionToggle.getAttribute("aria-controls") ?? "")}`,
      )?.hidden,
    ).toBe(true);
  } finally {
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await act(() => root.unmount());
    container.remove();
    model.dispose();
    vi.unstubAllGlobals();
  }
});
it("keeps existing rows mounted and visually enabled while selection waits, without permitting another navigation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const rows = [1, 2].map((id) =>
    ThreadContextSchema.parse({
      threadId: `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`,
      workingDirectoryId: "00000000-0000-4000-8000-000000000077",
      directory: "/one/project",
      title: `Thread ${id}`,
    }),
  );
  const first = rows[0],
    second = rows[1];
  if (!first || !second) throw Error("fixture");
  const draft = DraftSchema.parse({
    ...first,
    schemaVersion: 1,
    revision: 0,
    text: "",
  });
  let release = () => {};
  const selection = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = new AppModel({
    request: async (command) => {
      if (command.kind === "select-thread") await selection;
      return parseDesktopReply(command, {
        kind: "ready",
        draft:
          command.kind === "select-thread"
            ? { ...draft, threadId: second.threadId }
            : draft,
        directoryAvailable: true,
        preferences: { theme: "light", density: "normal", locale: "en-US" },
      });
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  });
  await model.start();
  model.threadListStore.setState({
    threads: rows,
    pending: false,
    failed: false,
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let switching: ReturnType<AppModel["selectThread"]> | undefined;
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ProjectThreads, { model }),
        }),
      ),
    );
    const initial = [
      ...container.querySelectorAll<HTMLButtonElement>(
        "[data-thread-navigation]",
      ),
    ];
    await act(async () => {
      switching = model.selectThread(second.threadId);
      await Promise.resolve();
    });
    expect([...container.querySelectorAll("[data-thread-navigation]")]).toEqual(
      initial,
    );
    expect(initial.every((row) => !row.disabled)).toBe(true);
    expect(
      initial.every((row) => row.getAttribute("aria-disabled") === "true"),
    ).toBe(true);
    expect(await model.selectThread(first.threadId)).toMatchObject({
      kind: "blocked",
      reason: "busy",
    });
    await act(async () => {
      release();
      await switching;
    });
    expect(
      initial.every(
        (row) => !row.disabled && row.getAttribute("aria-disabled") !== "true",
      ),
    ).toBe(true);
  } finally {
    await act(async () => {
      release();
      await switching;
    });
    await act(() => root.unmount());
    container.remove();
    model.dispose();
    vi.unstubAllGlobals();
  }
});
it("groups discovered sessions by exact working directory and shows their native titles", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const model = new AppModel({
    request: vi.fn(),
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  });
  model.threadListStore.setState({
    threads: [
      {
        threadId: "00000000-0000-4000-8000-000000000061",
        workingDirectoryId: "00000000-0000-4000-8000-000000000077",
        directory: "/one/project",
        title: "Native first",
        origin: "cli",
      },
      {
        threadId: "00000000-0000-4000-8000-000000000062",
        workingDirectoryId: "00000000-0000-4000-8000-000000000077",
        directory: "/one/project",
        title: "Native second",
        origin: "cli",
      },
      {
        threadId: "00000000-0000-4000-8000-000000000063",
        workingDirectoryId: "00000000-0000-4000-8000-000000000078",
        directory: "/two/project",
        title: "Other worktree",
        origin: "cli",
      },
    ].map((row) => ThreadContextSchema.parse(row)),
    failed: false,
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ProjectThreads, { model }),
        }),
      ),
    );
    const groups = container.querySelectorAll("[data-project-group]");
    expect(groups).toHaveLength(2);
    expect(
      groups[0]?.querySelectorAll("[data-thread-navigation]"),
    ).toHaveLength(2);
    expect(
      groups[1]?.querySelectorAll("[data-thread-navigation]"),
    ).toHaveLength(1);
    expect(container.textContent).toContain("Native first");
    expect(container.textContent).toContain("Native second");
    expect(container.textContent).toContain("Other worktree");
  } finally {
    await act(() => root.unmount());
    container.remove();
    model.dispose();
    vi.unstubAllGlobals();
  }
});

it("limits project children to five, expands on demand, and detaches individually pinned threads from pinned projects", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const model = new AppModel({
    request: vi.fn(),
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  });
  const { emptySidebarPreferences, updateSidebar } = await import(
    "../../../modules/preferences/core/public"
  );
  const rows = Array.from({ length: 7 }, (_, i) =>
    ThreadContextSchema.parse({
      threadId: `00000000-0000-4000-8000-${String(i + 61).padStart(12, "0")}`,
      workingDirectoryId: "00000000-0000-4000-8000-000000000077",
      directory: "/one/project",
      title: `Conversation ${i}`,
    }),
  );
  let value = emptySidebarPreferences();
  const projectId = rows[0]?.workingDirectoryId;
  if (!projectId || !rows[0]) throw Error("fixture");
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "project", id: projectId },
    value: true,
  });
  value = updateSidebar(value, {
    kind: "pin",
    item: { kind: "thread", id: rows[0].threadId },
    value: true,
  });
  model.threadListStore.setState({
    threads: rows,
    failed: false,
    pending: false,
  });
  model.sidebar.accept({ revision: 1, value });
  const change = vi
    .spyOn(model.sidebar, "change")
    .mockImplementation(async (intent) => {
      value = updateSidebar(value, intent);
      model.sidebar.accept({
        revision:
          (model.sidebar.stateStore.getState().snapshot?.revision ?? 1) + 1,
        value,
      });
    });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(I18nProvider, {
          initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
          children: createElement(ProjectThreads, { model }),
        }),
      ),
    );
    const pins = container.querySelector('[data-sidebar-section="pins"]');
    const group = pins?.querySelector("[data-project-group]");
    expect(group?.querySelectorAll("[data-thread-navigation]")).toHaveLength(5);
    expect(pins?.querySelectorAll("[data-thread-navigation]")).toHaveLength(6);
    expect(group?.textContent).not.toContain("Conversation 0");
    const expand = group?.querySelector<HTMLButtonElement>(
      "[data-expand-project]",
    );
    expect(expand).not.toBeNull();
    await act(() => expand?.click());
    expect(group?.querySelectorAll("[data-thread-navigation]")).toHaveLength(6);
    expect(change).toHaveBeenCalledWith({
      kind: "expand-project",
      id: projectId,
      value: true,
    });
    const collapse = group?.querySelector<HTMLButtonElement>(
      "[data-project-toggle]",
    );
    await act(() => collapse?.click());
    expect(
      group?.querySelector<HTMLElement>(".sidebar-project-children")?.hidden,
    ).toBe(true);
    expect(group?.querySelectorAll("[data-thread-navigation]")).toHaveLength(6);
    expect(pins?.querySelectorAll("[data-thread-navigation]")).toHaveLength(7);
  } finally {
    await act(() => root.unmount());
    container.remove();
    model.dispose();
    vi.unstubAllGlobals();
  }
});

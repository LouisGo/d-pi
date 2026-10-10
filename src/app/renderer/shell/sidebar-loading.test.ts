// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { emptySidebarPreferences } from "../../../modules/preferences/core/public";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { ThreadContextSchema } from "../../../modules/threads/contracts/public";
import { parseDesktopReply } from "../../contracts/desktop-bridge";
import { AppModel } from "../wiring/model";
import { ProjectThreads } from "./project-threads";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose();
  vi.unstubAllGlobals();
});
function sample() {
  let resolve: (value: unknown) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<unknown>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const project = {
  workingDirectoryId: "00000000-0000-4000-8000-000000000077",
  directory: "/one/project",
};
const row = ThreadContextSchema.parse({
  ...project,
  threadId: "00000000-0000-4000-8000-000000000001",
  title: "Existing thread",
});
function reply(
  nativeIndex: "ready" | "indexing",
  threads = [row],
  projects = [project],
) {
  return { kind: "threads", nativeIndex, threads, projects };
}
async function mount(samples: ReturnType<typeof sample>[]) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const queue = [...samples];
  const model = new AppModel({
    request: async (command) => {
      if (command.kind !== "list-threads") throw Error("Unexpected request");
      const next = queue.shift();
      if (!next) throw Error("Missing discovery sample");
      return parseDesktopReply(command, await next.promise);
    },
    onCloseRequest: () => () => {},
    onCloseCancelled: () => () => {},
    completeClose: () => {},
  });
  model.sidebar.accept({ revision: 1, value: emptySidebarPreferences() });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  cleanup.push(async () => {
    model.dispose();
    await act(async () => {
      for (const pending of samples) pending.resolve(reply("ready", [], []));
      await Promise.resolve();
      root.unmount();
    });
    container.remove();
  });
  await act(() =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
        children: createElement(ProjectThreads, { model }),
      }),
    ),
  );
  let refresh = Promise.resolve();
  await act(async () => {
    refresh = model.refreshThreads();
    await Promise.resolve();
  });
  return { model, container, refresh };
}

it("uses project and indented thread skeletons in the list, without a detached spinner or empty-state flash", async () => {
  const pending = sample();
  const { container, refresh } = await mount([pending]);
  expect(container.querySelector("[data-sidebar-skeleton]")).not.toBeNull();
  expect(
    container.querySelectorAll(
      ".sidebar-project-children [data-slot='skeleton']",
    ).length,
  ).toBeGreaterThan(5);
  expect(container.querySelector("[data-slot='loading-indicator']")).toBeNull();
  expect(container.querySelector("nav")?.getAttribute("aria-busy")).toBe(
    "true",
  );
  expect(
    container.querySelector("[data-sidebar-section='projects']"),
  ).toBeNull();
  await act(async () => {
    pending.resolve(reply("ready"));
    await refresh;
  });
  expect(container.querySelector("[data-sidebar-skeleton]")).toBeNull();
  expect(container.querySelector("[data-thread-navigation]")).not.toBeNull();
});

it("keeps discovered project rows and loads their unknown children in place until the first index settles", async () => {
  const indexing = sample(),
    ready = sample();
  const { container, refresh } = await mount([indexing, ready]);
  await act(async () => {
    indexing.resolve(reply("indexing", []));
    await Promise.resolve();
  });
  const projectRow = container.querySelector("[data-project-toggle]");
  expect(projectRow).not.toBeNull();
  expect(container.querySelector("[data-sidebar-skeleton]")).toBeNull();
  expect(
    container.querySelector("[data-sidebar-thread-skeleton]"),
  ).not.toBeNull();
  expect(container.querySelector(".sidebar-empty-project")).toBeNull();
  await act(async () => {
    ready.resolve(reply("ready", []));
    await refresh;
  });
  expect(container.querySelector("[data-project-toggle]")).toBe(projectRow);
  expect(container.querySelector("[data-sidebar-thread-skeleton]")).toBeNull();
  expect(container.querySelector(".sidebar-empty-project")).not.toBeNull();
});

it("respects a persisted collapsed project section during first loading and after discovery", async () => {
  const pending = sample();
  const { model, container, refresh } = await mount([pending]);
  await act(() =>
    model.sidebar.accept({
      revision: 2,
      value: { ...emptySidebarPreferences(), collapsedSections: ["projects"] },
    }),
  );
  const skeletonRows = container.querySelector(
    "[data-sidebar-thread-skeleton]",
  );
  expect(skeletonRows?.closest("[hidden]")).not.toBeNull();
  await act(async () => {
    pending.resolve(reply("ready"));
    await refresh;
  });
  expect(container.querySelector("[data-sidebar-skeleton]")).toBeNull();
  expect(
    container.querySelector("[data-thread-navigation]")?.closest("[hidden]"),
  ).not.toBeNull();
});

it("keeps confirmed thread rows mounted during background indexing, then applies the settled list", async () => {
  const first = sample(),
    indexing = sample(),
    partial = sample(),
    ready = sample();
  const { container, model, refresh } = await mount([
    first,
    indexing,
    partial,
    ready,
  ]);
  await act(async () => {
    first.resolve(reply("ready"));
    await refresh;
  });
  const original = container.querySelector("[data-thread-navigation]");
  let background = Promise.resolve();
  await act(async () => {
    background = model.refreshThreads();
    indexing.resolve(reply("indexing", [], []));
    await Promise.resolve();
  });
  expect(container.querySelector("[data-thread-navigation]")).toBe(original);
  expect(container.querySelector("[data-slot='skeleton']")).toBeNull();
  expect(container.querySelector("[data-slot='loading-indicator']")).toBeNull();
  await act(async () => {
    partial.resolve(
      reply("indexing", [
        { ...row, title: "In progress" },
        ThreadContextSchema.parse({
          ...row,
          threadId: "00000000-0000-4000-8000-000000000002",
        }),
      ]),
    );
    await Promise.resolve();
  });
  expect(container.querySelectorAll("[data-thread-navigation]")).toHaveLength(
    2,
  );
  expect(container.querySelector("[data-thread-navigation]")).toBe(original);
  expect(original?.textContent).toBe("In progress");
  await act(async () => {
    ready.resolve(reply("ready", [{ ...row, title: "Updated" }]));
    await background;
  });
  expect(container.querySelector("[data-thread-navigation]")).toBe(original);
  expect(original?.textContent).toBe("Updated");
  expect(container.querySelectorAll("[data-thread-navigation]")).toHaveLength(
    1,
  );
});

it("keeps a confirmed empty list as an empty state during refresh, rather than returning to first-load skeletons", async () => {
  const first = sample(),
    next = sample(),
    ready = sample();
  const { container, model, refresh } = await mount([first, next, ready]);
  await act(async () => {
    first.resolve(reply("ready", [], []));
    await refresh;
  });
  const emptyState = container.querySelector(".sidebar-feedback");
  expect(emptyState).not.toBeNull();
  let background = Promise.resolve();
  await act(async () => {
    background = model.refreshThreads();
    await Promise.resolve();
  });
  expect(container.querySelector(".sidebar-feedback")).toBe(emptyState);
  expect(container.querySelector("[data-slot='skeleton']")).toBeNull();
  await act(async () => {
    next.resolve(reply("indexing", [], []));
    await Promise.resolve();
  });
  expect(container.querySelector(".sidebar-feedback")).toBe(emptyState);
  expect(container.querySelector("[data-slot='skeleton']")).toBeNull();
  await act(async () => {
    ready.resolve(reply("ready", [], []));
    await background;
  });
});

it("ends initial skeleton loading on a failed indexing read, keeps known projects, and offers retry", async () => {
  const indexing = sample(),
    failure = sample();
  const { container, refresh } = await mount([indexing, failure]);
  await act(async () => {
    indexing.resolve(reply("indexing", []));
    await Promise.resolve();
  });
  await act(async () => {
    failure.reject(Error("offline"));
    await refresh;
  });
  expect(container.querySelector("[data-slot='skeleton']")).toBeNull();
  expect(container.querySelector("[data-slot='loading-indicator']")).toBeNull();
  expect(container.querySelector("nav")?.getAttribute("aria-busy")).toBe(
    "false",
  );
  expect(container.querySelector("[data-project-toggle]")).not.toBeNull();
  expect(container.querySelector("[role='alert'] button")).not.toBeNull();
  expect(container.querySelector(".sidebar-empty-project")).toBeNull();
});

// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../modules/preferences/renderer/public";
import { AppModel } from "../wiring/model";
import { ProjectThreads } from "./project-threads";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
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
        threadId: "a",
        workingDirectoryId: "w",
        directory: "/one/project",
        title: "Native first",
        origin: "cli",
      },
      {
        threadId: "b",
        workingDirectoryId: "w",
        directory: "/one/project",
        title: "Native second",
        origin: "cli",
      },
      {
        threadId: "c",
        workingDirectoryId: "x",
        directory: "/two/project",
        title: "Other worktree",
        origin: "cli",
      },
    ],
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

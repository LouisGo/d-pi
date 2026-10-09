// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { SettingsGroup } from "./public";

it("retains and associates a group description when no title is supplied", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        createElement(SettingsGroup, {
          description: "Applies to the current project",
          children: createElement("p", null, "Project preferences"),
        }),
      ),
    );
    expect(host.textContent).toContain("Applies to the current project");
    const group = host.querySelector("section");
    expect(
      document.getElementById(group?.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe("Applies to the current project");
    expect(group?.hasAttribute("aria-labelledby")).toBe(false);
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

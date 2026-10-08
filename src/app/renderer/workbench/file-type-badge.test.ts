// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { FileTypeBadge } from "./file-type-badge";

it("uses declared MIME before a misleading extension and keeps its icon decorative", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  const root = createRoot(container);
  try {
    await act(() =>
      root.render(
        createElement(FileTypeBadge, {
          name: "clip.mp4",
          mimeType: "application/pdf",
        }),
      ),
    );
    expect(container.firstElementChild?.getAttribute("data-file-kind")).toBe(
      "pdf",
    );
    expect(container.textContent).toBe("PDF");
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  } finally {
    await act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

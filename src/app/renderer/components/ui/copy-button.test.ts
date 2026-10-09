// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "../../../../modules/preferences/renderer/public";
import { CopyButton } from "./copy-button";

it("only confirms a completed clipboard write and exposes rejection with a retryable action", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let complete: (() => void) | undefined;
  const write = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (text: string) =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
        children: createElement(CopyButton, { text, label: "Copy" }),
      }),
    );
  try {
    await act(async () => render("Original message"));
    await act(async () => host.querySelector("button")?.click());
    expect(write).toHaveBeenCalledExactlyOnceWith("Original message");
    expect(host.querySelector("button")?.disabled).toBe(true);
    expect(host.textContent).not.toContain("Copied");
    await act(async () => complete?.());
    expect(host.querySelector("button")?.textContent).toContain("Copied");
    await act(async () => render("Another message"));
    write.mockRejectedValueOnce(new Error("Clipboard denied"));
    await act(async () => host.querySelector("button")?.click());
    expect(host.querySelector("[role=alert]")?.textContent).toContain(
      "Copy failed",
    );
    expect(host.querySelector("button")?.disabled).toBe(false);
    expect(host.querySelector("button")?.textContent).toBe("Copy");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("ignores a stale clipboard completion after the source changes and blocks duplicate pending writes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let complete: (() => void) | undefined;
  const write = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = (text: string) =>
    root.render(
      createElement(I18nProvider, {
        initialSnapshot: { preference: "en-US", resolvedLocale: "en-US" },
        children: createElement(CopyButton, { text, label: "Copy" }),
      }),
    );
  try {
    await act(async () => render("Original"));
    await act(async () => {
      host.querySelector("button")?.click();
      host.querySelector("button")?.click();
    });
    expect(write).toHaveBeenCalledTimes(1);
    await act(async () => render("Changed"));
    await act(async () => complete?.());
    expect(host.querySelector("button")?.textContent).toBe("Copy");
    expect(host.querySelector("button")?.disabled).toBe(false);
    write.mockResolvedValueOnce();
    await act(async () => host.querySelector("button")?.click());
    expect(write).toHaveBeenLastCalledWith("Changed");
    expect(host.querySelector("button")?.textContent).toBe("Copied");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OptionAction } from "./public";

it("keeps choice labels and help distinct, forwards focus and excludes disabled actions", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ref = createRef<HTMLButtonElement>();
  const answer = vi.fn();
  const props = {
    label: "Continue in this project",
    description: "Keep the existing session and files",
    ref,
    onClick: answer,
  };
  try {
    await act(() => root.render(createElement(OptionAction, props)));
    const button = ref.current;
    expect(button?.getAttribute("type")).toBe("button");
    expect(
      document.getElementById(button?.getAttribute("aria-labelledby") ?? "")
        ?.textContent,
    ).toBe(props.label);
    expect(
      document.getElementById(button?.getAttribute("aria-describedby") ?? "")
        ?.textContent,
    ).toBe(props.description);
    button?.focus();
    expect(document.activeElement).toBe(button);
    await act(() => button?.click());
    expect(answer).toHaveBeenCalledTimes(1);
    await act(() =>
      root.render(createElement(OptionAction, { ...props, disabled: true })),
    );
    await act(() => button?.click());
    expect(answer).toHaveBeenCalledTimes(1);
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

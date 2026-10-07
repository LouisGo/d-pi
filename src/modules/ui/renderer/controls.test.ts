// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ChoiceGroup, FormField, Select, Switch, TextInput } from "./public";

it("links form labels and help/errors to the real input", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(() =>
      root.render(
        createElement(FormField, {
          label: "API key",
          description: "Stored natively",
          error: "Save failed",
          children: ({ id, describedBy, invalid }) =>
            createElement(TextInput, {
              id,
              "aria-describedby": describedBy,
              "aria-invalid": invalid,
            }),
        }),
      ),
    );
    const input = host.querySelector("input");
    expect(host.querySelector("label")?.htmlFor).toBe(input?.id);
    expect(input?.getAttribute("aria-invalid")).toBe("true");
    for (const id of input?.getAttribute("aria-describedby")?.split(" ") ?? [])
      expect(document.getElementById(id)).not.toBeNull();
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("changes a switch once and respects disabled state", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changed = vi.fn();
  function Sample({ disabled = false }: { disabled?: boolean }) {
    const [checked, setChecked] = useState(false);
    return createElement(Switch, {
      checked,
      disabled,
      "aria-label": "Notifications",
      onCheckedChange: (next) => {
        changed(next);
        setChecked(next);
      },
    });
  }
  try {
    await act(() => root.render(createElement(Sample)));
    await act(() => host.querySelector<HTMLElement>("[role=switch]")?.click());
    expect(changed).toHaveBeenCalledExactlyOnceWith(true);
    expect(
      host.querySelector("[role=switch]")?.getAttribute("aria-checked"),
    ).toBe("true");
    await act(() => root.render(createElement(Sample, { disabled: true })));
    await act(() => host.querySelector<HTMLElement>("[role=switch]")?.click());
    expect(changed).toHaveBeenCalledTimes(1);
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("names choices and exposes the selected value without cycling through other values", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(ChoiceGroup, {
          value: "light",
          options: [
            { value: "system", label: "System" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ],
          onValueChange: change,
          "aria-label": "Mode",
        }),
      ),
    );
    const dark = host.querySelector<HTMLElement>(
      "[role=radio][aria-label=Dark]",
    );
    await act(() => dark?.click());
    expect(change).toHaveBeenCalledExactlyOnceWith("dark");
    expect(
      host
        .querySelector("[role=radio][aria-label=Light]")
        ?.getAttribute("aria-checked"),
    ).toBe("true");
    await act(() =>
      root.render(
        createElement(Select, {
          value: "en",
          options: [
            { value: "en", label: "English" },
            { value: "zh", label: "Chinese" },
          ],
          onValueChange: change,
          "aria-label": "Language",
        }),
      ),
    );
    expect(host.querySelector("[role=combobox]")?.textContent).toContain(
      "English",
    );
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

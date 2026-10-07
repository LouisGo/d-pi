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

it("opens a searchable picker with filtering and keeps selection until an option is chosen", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(Select, {
          value: "a",
          options: [
            { value: "a", label: "Alpha" },
            { value: "b", label: "Beta" },
          ],
          onValueChange: change,
          "aria-label": "Model",
          search: { label: "Search models", empty: "No models" },
        }),
      ),
    );
    await act(() => host.querySelector<HTMLElement>("button")?.click());
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Search models"]',
    );
    expect(input).not.toBeNull();
    await act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "Beta");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      Array.from(document.querySelectorAll("[role=option]")).map(
        (el) => el.textContent,
      ),
    ).toEqual(["Beta"]);
    expect(change).not.toHaveBeenCalled();
    await act(() =>
      document.querySelector<HTMLElement>("[role=option]")?.click(),
    );
    expect(change).toHaveBeenCalledExactlyOnceWith("b");
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("keeps four segmented choices controlled and skips disabled options with the keyboard", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn();
  function Sample() {
    const [value, setValue] = useState("drive");
    return createElement(ChoiceGroup, {
      value,
      options: [
        { value: "drive", label: "Drive" },
        { value: "dots", label: "Dots", disabled: true },
        { value: "orbit", label: "Orbit" },
        { value: "surfer", label: "Surfer", disabled: true },
      ],
      "aria-label": "Mode",
      onValueChange: (next) => {
        change(next);
        setValue(next);
      },
    });
  }
  try {
    await act(() => root.render(createElement(Sample)));
    const drive = host.querySelector<HTMLElement>(
      "[role=radio][aria-label=Drive]",
    );
    const orbit = host.querySelector<HTMLElement>(
      "[role=radio][aria-label=Orbit]",
    );
    await act(() => drive?.focus());
    await act(() =>
      drive?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(orbit?.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(orbit);
    expect(change).toHaveBeenCalledExactlyOnceWith("orbit");
    await act(() =>
      host.querySelector<HTMLElement>("[role=radio][aria-label=Dots]")?.click(),
    );
    expect(change).toHaveBeenCalledOnce();
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

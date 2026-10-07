// @vitest-environment happy-dom
import { act, createElement, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import {
  Checkbox,
  Disclosure,
  DisclosureTrigger,
  FormField,
  TextArea,
} from "./public";

it("preserves native checkbox form submission, disabled exclusion and input ref", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const form = document.createElement("form");
  document.body.append(form);
  const root = createRoot(form);
  const ref = createRef<HTMLInputElement>();
  try {
    await act(() =>
      root.render(
        createElement(Checkbox, {
          ref,
          name: "retained",
          value: "image-1",
          defaultChecked: true,
          "aria-label": "Retain image",
        }),
      ),
    );
    expect(new FormData(form).get("retained")).toBe("image-1");
    expect(ref.current?.type).toBe("checkbox");
    await act(() =>
      root.render(
        createElement(Checkbox, {
          ref,
          name: "retained",
          value: "image-1",
          defaultChecked: true,
          disabled: true,
        }),
      ),
    );
    expect(new FormData(form).has("retained")).toBe(false);
  } finally {
    await act(() => root.unmount());
    form.remove();
  }
});

it("links multiline field errors and retains the native editable ref", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const ref = createRef<HTMLTextAreaElement>();
  try {
    await act(() =>
      root.render(
        createElement(FormField, {
          label: "Answer",
          error: "Required",
          children: ({ id, describedBy, invalid }) =>
            createElement(TextArea, {
              ref,
              id,
              "aria-describedby": describedBy,
              "aria-invalid": invalid,
              defaultValue: "line one\nline two",
            }),
        }),
      ),
    );
    expect(host.querySelector("label")?.htmlFor).toBe(ref.current?.id);
    expect(ref.current?.value).toBe("line one\nline two");
    expect(
      document.getElementById(
        ref.current?.getAttribute("aria-describedby") ?? "",
      )?.textContent,
    ).toBe("Required");
    expect(ref.current?.getAttribute("aria-invalid")).toBe("true");
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

it("keeps disclosure content and uncontrolled input state when open changes", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const sample = (open: boolean) =>
    createElement(
      Disclosure,
      { open },
      createElement(DisclosureTrigger, null, "Details"),
      createElement(TextArea, { defaultValue: "draft" }),
    );
  try {
    await act(() => root.render(sample(true)));
    const input = host.querySelector("textarea");
    if (!input) throw Error("missing editor");
    input.value = "unsaved";
    await act(() => root.render(sample(false)));
    expect(host.querySelector("details")?.open).toBe(false);
    expect(host.querySelector("textarea")).toBe(input);
    expect(input.value).toBe("unsaved");
  } finally {
    await act(() => root.unmount());
    host.remove();
  }
});

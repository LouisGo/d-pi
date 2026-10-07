// @vitest-environment happy-dom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ComponentDashboard } from "./component-dashboard";

vi.mock("../../components/icons/common", async (original) => ({
  ...(await original<typeof import("../../components/icons/common")>()),
  FutureIcon: () => createElement("svg", { "data-new-icon": true }),
}));

const mounted: { root: Root; container: HTMLElement }[] = [];
afterEach(async () => {
  for (const { root, container } of mounted.splice(0)) {
    await act(() => root.unmount());
    container.remove();
  }
  vi.unstubAllGlobals();
});
async function setup(additionalPreview?: ReactNode) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(() =>
    root.render(createElement(ComponentDashboard, { additionalPreview })),
  );
  const button = (label: string, within: ParentNode = container) => {
    const node = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      (element) =>
        element.getAttribute("aria-label") === label ||
        element.textContent === label,
    );
    if (!node) throw Error(`missing button: ${label}`);
    return node;
  };
  return { container, button };
}

it("shows every existing foundation component as a real preview by default", async () => {
  const { container } = await setup();
  expect(
    [...container.querySelectorAll("[data-component]")].map((node) =>
      node.getAttribute("data-component"),
    ),
  ).toEqual([
    "Button",
    "IconButton",
    "Select",
    "Switch",
    "FormField",
    "ChoiceGroup",
    "SettingsGroup",
    "TabStrip",
    "ResizableSplit",
    "NavigationOverlay",
    "SettingsModal",
    "Icon Layer",
  ]);
  expect(
    container.querySelector("[data-component='Button'] [data-slot='button']"),
  ).not.toBeNull();
  expect(
    container.querySelector("[data-component='TabStrip'] [role='tablist']"),
  ).not.toBeNull();
  expect(
    container.querySelectorAll(
      "[data-component='ResizableSplit'] [role='separator']",
    ),
  ).toHaveLength(2);
  expect(
    container.querySelectorAll("[data-component='Icon Layer'] svg").length,
  ).toBeGreaterThan(0);
});

it("uses independent real button and icon interactions and resets only the selected demo", async () => {
  const { container, button } = await setup();
  await act(() => button("主操作").click());
  await act(() => button("添加演示项目").click());
  expect(container.querySelector("[aria-label='按钮反馈']")?.textContent).toBe(
    "已点击 1 次",
  );
  expect(
    container.querySelector("[data-component='IconButton'] output")
      ?.textContent,
  ).toBe("添加了 1 个演示项目");
  await act(() => button("导航选择").click());
  expect(button("选中").getAttribute("aria-pressed")).toBe("true");
  await act(() => button("禁用").click());
  expect(container.querySelector("[aria-label='按钮反馈']")?.textContent).toBe(
    "已点击 1 次",
  );
  await act(() => button("重置 Button").click());
  expect(container.querySelector("[aria-label='按钮反馈']")?.textContent).toBe(
    "已点击 0 次",
  );
  expect(button("导航选择").getAttribute("aria-pressed")).toBe("false");
  expect(
    container.querySelector("[data-component='IconButton'] output")
      ?.textContent,
  ).toBe("添加了 1 个演示项目");
  await act(() => button("重置 IconButton").click());
  expect(
    container.querySelector("[data-component='IconButton'] output")
      ?.textContent,
  ).toBe("添加了 0 个演示项目");
});

it("switches and closes real workspace tabs with keyboard navigation and restores them", async () => {
  const { container, button } = await setup();
  const section = container.querySelector("[data-component='TabStrip']");
  if (!section) throw Error("missing tabs preview");
  await act(() => button("预览", section).click());
  expect(section.querySelector("[role='tabpanel']")?.textContent).toBe(
    "当前页签：预览",
  );
  await act(() => {
    button("预览", section).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
  expect(section.querySelector("[role='tabpanel']")?.textContent).toBe(
    "当前页签：设置",
  );
  expect(document.activeElement).toBe(button("设置", section));
  await act(() => button("关闭 设置", section).click());
  expect(section.querySelectorAll("[role='tab']")).toHaveLength(2);
  expect(section.querySelector("[role='tabpanel']")?.textContent).toBe(
    "当前页签：文件",
  );
  await act(() => button("关闭 文件", section).click());
  await act(() => button("关闭 预览", section).click());
  expect(section.textContent).toContain("页签已全部关闭，重置可恢复。");
  await act(() => button("重置 TabStrip").click());
  expect(section.querySelectorAll("[role='tab']")).toHaveLength(3);
  expect(section.querySelector("[role='tabpanel']")?.textContent).toBe(
    "当前页签：文件",
  );
});

it("opens real portaled dialogs, interacts locally and resets the selected choice", async () => {
  const { container, button } = await setup();
  await act(() => button("打开导航抽屉").click());
  const navigation = document.querySelector(".ui-navigation-overlay");
  if (!navigation) throw Error("missing navigation overlay");
  expect(navigation.getAttribute("role")).toBe("dialog");
  await act(() => button("文件", navigation).click());
  await act(() => button("关闭导航抽屉", navigation).click());
  expect(
    container.querySelector("[data-component='NavigationOverlay']")
      ?.textContent,
  ).toContain("当前选项：文件");
  await act(() => button("重置 NavigationOverlay").click());
  expect(
    container.querySelector("[data-component='NavigationOverlay']")
      ?.textContent,
  ).toContain("当前选项：概览");
  await act(() => button("打开设置弹层").click());
  const settings = document.querySelector(".ui-settings-modal:not([hidden])");
  if (!settings) throw Error("missing settings modal");
  expect(settings.getAttribute("role")).toBe("dialog");
  await act(() => button("关于", settings).click());
  expect(settings.querySelector("h3")?.textContent).toBe("关于");
  await act(() => button("关闭设置弹层", settings).click());
  await act(() => button("重置 SettingsModal").click());
  expect(
    container.querySelector("[data-component='SettingsModal']")?.textContent,
  ).toContain("当前选项：外观");
});

it("hides and restores real split panels", async () => {
  const { container, button } = await setup();
  const section = container.querySelector("[data-component='ResizableSplit']");
  if (!section) throw Error("missing split preview");
  await act(() => button("隐藏辅助面板", section).click());
  expect(
    container
      .querySelector("#gallery-horizontal-separator")
      ?.getAttribute("aria-disabled"),
  ).toBe("true");
  expect(
    container
      .querySelector("#gallery-horizontal-aux .ui-panel")
      ?.getAttribute("aria-hidden"),
  ).toBe("true");
  await act(() => button("重置 ResizableSplit").click());
  expect(
    container
      .querySelector("#gallery-horizontal-separator")
      ?.getAttribute("aria-disabled"),
  ).not.toBe("true");
});

it("includes an optional menu preview in category navigation, search and reset", async () => {
  const { container, button } = await setup(
    createElement("button", null, "菜单演示"),
  );
  expect(container.querySelectorAll("[data-component]")).toHaveLength(13);
  expect(
    container.querySelector("#gallery-overlays [data-component='HoverMenu']"),
  ).not.toBeNull();
  const before = button("菜单演示");
  await act(() => button("重置 HoverMenu").click());
  expect(button("菜单演示")).not.toBe(before);
  const input = container.querySelector<HTMLInputElement>(
    "input[aria-label='搜索组件']",
  );
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  if (!input || !setter) throw Error("missing search");
  await act(() => {
    setter.call(input, "hovermenu");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(container.querySelectorAll("[data-component]")).toHaveLength(1);
  expect(
    container.querySelector("[data-component='HoverMenu']"),
  ).not.toBeNull();
  expect(
    container.querySelector("[data-gallery-title]")?.textContent,
  ).toContain("1 / 13 项");
});

it("filters by purpose and form, explains no matches and restores the full catalog", async () => {
  const { container, button } = await setup();
  const input = container.querySelector<HTMLInputElement>(
    "input[aria-label='搜索组件']",
  );
  if (!input) throw Error("missing search");
  const search = async (query: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (!setter) throw Error("missing input value setter");
    await act(() => {
      setter.call(input, query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await search("方向键");
  expect(
    [...container.querySelectorAll("[data-component]")].map((node) =>
      node.getAttribute("data-component"),
    ),
  ).toEqual(["TabStrip", "ResizableSplit"]);
  await search(" GHOST ");
  expect(container.querySelectorAll("[data-component]")).toHaveLength(1);
  await search("does-not-exist");
  expect(container.textContent).toContain("没有匹配的组件");
  expect(container.querySelectorAll("[data-component]")).toHaveLength(0);
  await act(() => button("清空搜索").click());
  expect(input.value).toBe("");
  expect(container.querySelectorAll("[data-component]")).toHaveLength(12);
});

it("groups every component in the separate right navigation with existing anchor targets", async () => {
  const { container } = await setup(createElement("span", null, "Menu sample"));
  const index = container.querySelector('nav[aria-label="组件索引"]');
  expect(index?.closest("[data-gallery-navigation]")).not.toBeNull();
  expect(container.querySelector("header nav")).toBeNull();
  for (const link of index?.querySelectorAll("a") ?? [])
    expect(
      container.querySelector(link.getAttribute("href") ?? ""),
    ).not.toBeNull();
  expect(
    [...(index?.querySelectorAll("a[data-component-anchor]") ?? [])].map(
      (link) => link.textContent,
    ),
  ).toEqual([
    "Button",
    "IconButton",
    "Select",
    "Switch",
    "FormField",
    "ChoiceGroup",
    "SettingsGroup",
    "TabStrip",
    "ResizableSplit",
    "NavigationOverlay",
    "SettingsModal",
    "HoverMenu",
    "Icon Layer",
  ]);
});

it("automatically shows new Icon Layer exports without a gallery entry and keeps icons read-only", async () => {
  const { container } = await setup();
  const icons = container.querySelector("[data-component='Icon Layer']");
  expect(icons?.textContent).toContain("FutureIcon");
  expect(icons?.querySelector("svg[data-new-icon]")).not.toBeNull();
  expect(icons?.querySelector("button")).toBeNull();
});

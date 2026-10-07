import { z } from "zod";
import { createStore } from "zustand/vanilla";
import type { LayoutConstraints, LayoutIntent, Region } from "./geometry";

const RegionSchema = z.strictObject({
  open: z.boolean(),
  size: z.number().finite().nonnegative().max(10000),
});
const IntentSchema = z.strictObject({
  sidebar: RegionSchema,
  workspace: RegionSchema,
  bottom: RegionSchema,
});
const storageKey = "d-pi.workbench-layout.v1";
export function readLayoutTokens() {
  const css =
    typeof getComputedStyle === "undefined"
      ? null
      : getComputedStyle(document.documentElement);
  const font = parseFloat(css?.fontSize ?? "") || 16;
  const px = (name: string) => {
    const raw = css?.getPropertyValue(name).trim() ?? "";
    return (parseFloat(raw) || 0) * (raw.endsWith("rem") ? font : 1);
  };
  const constraints: LayoutConstraints = {
    separator: px("--separator-size"),
    sidebarMin: px("--sidebar-min"),
    sidebarMax: px("--sidebar-max"),
    conversationMin: px("--conversation-min"),
    workspaceMin: px("--workspace-min"),
    workspaceMax: px("--workspace-max"),
    bottomMin: px("--bottom-min"),
    conversationMinHeight: px("--conversation-min-height"),
  };
  return {
    constraints,
    defaults: {
      sidebar: { open: true, size: px("--sidebar-width") },
      workspace: { open: false, size: px("--workspace-default") },
      bottom: { open: false, size: px("--bottom-default") },
    },
  };
}
export function createLayoutModel(
  defaults: LayoutIntent,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  let initial = defaults;
  try {
    const raw = storage?.getItem(storageKey);
    if (raw) {
      const parsed = IntentSchema.safeParse(JSON.parse(raw));
      if (parsed.success) initial = parsed.data;
    }
  } catch {
    /* Layout persistence is optional; no business data is involved. */
  }
  const store = createStore<LayoutIntent>(() => initial);
  const write = (region: Region, value: LayoutIntent[Region]) => {
    const current = store.getState();
    if (
      current[region].open === value.open &&
      Math.abs(current[region].size - value.size) < 0.5
    )
      return;
    const next = { ...current, [region]: value };
    store.setState(next, true);
    try {
      storage?.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Keep the usable in-memory layout. */
    }
  };
  return {
    store: {
      getState: store.getState,
      getInitialState: store.getInitialState,
      subscribe: store.subscribe,
    },
    toggle(region: Region) {
      const value = store.getState()[region];
      write(region, { ...value, open: !value.open });
    },
    commit(region: Region, size: number) {
      const previous = store.getState()[region];
      write(region, {
        open: size > 0.5,
        size: size > 0.5 ? size : previous.size,
      });
    },
  };
}
export type LayoutModel = ReturnType<typeof createLayoutModel>;

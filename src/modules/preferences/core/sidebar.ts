import { match } from "ts-pattern";
import type {
  SidebarChange,
  SidebarItem,
  SidebarPreferences,
} from "../contracts/public";

export interface SidebarCatalog {
  readonly projects: readonly string[];
  readonly threads: readonly { threadId: string; workingDirectoryId: string }[];
}
export function emptySidebarPreferences(): SidebarPreferences {
  return {
    schemaVersion: 1,
    pins: [],
    projectOrder: [],
    threadOrder: {},
    collapsedProjects: [],
    expandedProjects: [],
    collapsedSections: [],
  };
}
export function sidebarItemKey(item: SidebarItem): string {
  return `${item.kind}:${item.id}`;
}
export function reconcileSidebar(
  current: SidebarPreferences,
  catalog: SidebarCatalog,
): SidebarPreferences {
  const threadOrder = { ...current.threadOrder };
  const discovered = new Map<string, string[]>();
  for (const thread of catalog.threads) {
    const group = discovered.get(thread.workingDirectoryId) ?? [];
    group.push(thread.threadId);
    discovered.set(thread.workingDirectoryId, group);
  }
  for (const [id, ids] of discovered)
    threadOrder[id] = [...new Set([...(threadOrder[id] ?? []), ...ids])];
  return {
    ...current,
    projectOrder: [...new Set([...current.projectOrder, ...catalog.projects])],
    threadOrder,
  };
}
function move<T>(
  order: readonly T[],
  item: T,
  before: T | null,
  key: (value: T) => string,
): T[] {
  if (before !== null && key(item) === key(before)) return [...order];
  const next = order.filter((value) => key(value) !== key(item));
  const anchor =
    before === null
      ? -1
      : next.findIndex((value) => key(value) === key(before));
  next.splice(anchor < 0 ? next.length : anchor, 0, item);
  return next;
}
function membership<T>(items: readonly T[], item: T, enabled: boolean): T[] {
  return enabled
    ? [...new Set([...items, item])]
    : items.filter((value) => value !== item);
}
export function updateSidebar(
  current: SidebarPreferences,
  change: SidebarChange,
): SidebarPreferences {
  return match(change)
    .with({ kind: "pin" }, ({ item, value }) => ({
      ...current,
      pins: value
        ? current.pins.some(
            (pin) => sidebarItemKey(pin) === sidebarItemKey(item),
          )
          ? current.pins
          : [...current.pins, item]
        : current.pins.filter(
            (pin) => sidebarItemKey(pin) !== sidebarItemKey(item),
          ),
    }))
    .with({ kind: "move-pin" }, ({ item, before }) => ({
      ...current,
      pins: move(current.pins, item, before, sidebarItemKey),
    }))
    .with({ kind: "move-project" }, ({ id, before }) => ({
      ...current,
      projectOrder: move(current.projectOrder, id, before, (id) => id),
    }))
    .with({ kind: "move-thread" }, ({ projectId, id, before }) => ({
      ...current,
      threadOrder: {
        ...current.threadOrder,
        [projectId]: move(
          current.threadOrder[projectId] ?? [],
          id,
          before,
          (id) => id,
        ),
      },
    }))
    .with({ kind: "collapse-project" }, ({ id, value }) => ({
      ...current,
      collapsedProjects: membership(current.collapsedProjects, id, value),
    }))
    .with({ kind: "expand-project" }, ({ id, value }) => ({
      ...current,
      expandedProjects: membership(current.expandedProjects, id, value),
    }))
    .with({ kind: "collapse-section" }, ({ section, value }) => ({
      ...current,
      collapsedSections: membership(current.collapsedSections, section, value),
    }))
    .exhaustive();
}
export function validSidebarChange(
  current: SidebarPreferences,
  catalog: SidebarCatalog,
  change: SidebarChange,
): boolean {
  const project = (id: string) => catalog.projects.includes(id);
  const thread = (id: string) =>
    catalog.threads.some((thread) => thread.threadId === id);
  const item = (value: SidebarItem) =>
    value.kind === "project" ? project(value.id) : thread(value.id);
  const pinned = (value: SidebarItem) =>
    current.pins.some((pin) => sidebarItemKey(pin) === sidebarItemKey(value));
  return match(change)
    .with({ kind: "pin" }, ({ item: value }) => item(value))
    .with(
      { kind: "move-pin" },
      ({ item: value, before }) =>
        item(value) &&
        pinned(value) &&
        (before === null || (item(before) && pinned(before))),
    )
    .with(
      { kind: "move-project" },
      ({ id, before }) =>
        project(id) &&
        !pinned({ kind: "project", id }) &&
        (before === null ||
          (project(before) && !pinned({ kind: "project", id: before }))),
    )
    .with({ kind: "move-thread" }, ({ projectId, id, before }) => {
      const belongs = (id: string) =>
        catalog.threads.some(
          (thread) =>
            thread.threadId === id && thread.workingDirectoryId === projectId,
        ) && !pinned({ kind: "thread", id });
      return (
        project(projectId) &&
        belongs(id) &&
        (before === null || belongs(before))
      );
    })
    .with({ kind: "collapse-project" }, { kind: "expand-project" }, ({ id }) =>
      project(id),
    )
    .with({ kind: "collapse-section" }, () => true)
    .exhaustive();
}

import type {
  SidebarItem,
  SidebarPreferences,
} from "../../../modules/preferences/contracts/public";
import { sidebarItemKey } from "../../../modules/preferences/core/public";
import type {
  ProjectContext,
  ThreadContext,
} from "../../../modules/threads/contracts/public";
export interface SidebarProject {
  project: ProjectContext;
  threads: ThreadContext[];
  sourceThreadId?: ThreadContext["threadId"] | undefined;
}
export type SidebarEntry = { item: SidebarItem; label: string } & (
  | { kind: "project"; group: SidebarProject }
  | { kind: "thread"; thread: ThreadContext }
);
export function projectName(directory: string): string {
  return directory.split(/[\\/]/).filter(Boolean).at(-1) ?? directory;
}
function ordered<T>(
  values: readonly T[],
  order: readonly string[],
  key: (value: T) => string,
): T[] {
  const rank = new Map(order.map((id, index) => [id, index]));
  return [...values].sort(
    (a, b) => (rank.get(key(a)) ?? Infinity) - (rank.get(key(b)) ?? Infinity),
  );
}
export function projectSidebar(
  projects: readonly ProjectContext[],
  threads: readonly ThreadContext[],
  value: SidebarPreferences,
): { pins: SidebarEntry[]; projects: SidebarEntry[] } {
  const sourceThreads = new Map<string, ThreadContext["threadId"]>(
    threads.map((thread) => [thread.workingDirectoryId, thread.threadId]),
  );
  threads = threads.filter((thread) => !thread.completed);
  const groups = new Map<string, SidebarProject>();
  for (const project of projects)
    groups.set(project.workingDirectoryId, { project, threads: [] });
  for (const thread of threads) {
    const group = groups.get(thread.workingDirectoryId) ?? {
      project: {
        workingDirectoryId: thread.workingDirectoryId,
        directory: thread.directory,
      },
      threads: [],
    };
    group.threads.push(thread);
    groups.set(thread.workingDirectoryId, group);
  }
  const pins = new Set(value.pins.map(sidebarItemKey));
  const entries = new Map<string, SidebarEntry>();
  for (const [id, group] of groups) {
    const item = { kind: "project" as const, id };
    const children = ordered(
      group.threads,
      value.threadOrder[id] ?? [],
      (thread) => thread.threadId,
    ).filter(
      (thread) =>
        !pins.has(sidebarItemKey({ kind: "thread", id: thread.threadId })),
    );
    entries.set(sidebarItemKey(item), {
      kind: "project",
      item,
      label: projectName(group.project.directory),
      group: {
        ...group,
        threads: children,
        sourceThreadId: sourceThreads.get(id),
      },
    });
  }
  for (const thread of threads) {
    const item = { kind: "thread" as const, id: thread.threadId };
    entries.set(sidebarItemKey(item), {
      kind: "thread",
      item,
      thread,
      label: thread.title ?? "",
    });
  }
  return {
    pins: value.pins.flatMap((item) => {
      const entry = entries.get(sidebarItemKey(item));
      return entry ? [entry] : [];
    }),
    projects: ordered(
      [...entries.values()].filter(
        (entry) =>
          entry.kind === "project" && !pins.has(sidebarItemKey(entry.item)),
      ),
      value.projectOrder,
      (entry) => entry.item.id,
    ),
  };
}

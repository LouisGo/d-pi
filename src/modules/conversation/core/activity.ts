import { subscribeWithSelector } from "zustand/middleware";
import { createStore } from "zustand/vanilla";
import type { ConversationItem } from "../contracts/public";
import type { ToolSemantic } from "../contracts/tool-semantic";
import { ItemIndex } from "./item-index";

/** Proven association supplied by the native adapter, never inferred from timestamps. */
export interface ActivityMember {
  key: string;
  state: ConversationItem["state"];
  relation?: { kind: "native-call-batch" | "observed-native-turn"; id: string };
  changedFiles?: number;
}
export type ActivityRow =
  | { kind: "member"; key: string }
  | { kind: "group"; key: string; id: number };
export interface ActivityGroup {
  id: number;
  key: string;
  relation: NonNullable<ActivityMember["relation"]>;
  members: readonly string[];
  count: number;
  failed: number;
  aborted: number;
  running: number;
  changedFiles: number;
  expanded: boolean;
}
interface ActivityState {
  rows: readonly ActivityRow[];
  groups: Pick<ReadonlyMap<number, ActivityGroup>, "get">;
}
const createActivityStore = () =>
  createStore<ActivityState>()(
    subscribeWithSelector(
      (): ActivityState => ({
        rows: [],
        groups: new ItemIndex<ActivityGroup>(),
      }),
    ),
  );
const relationKey = (member: ActivityMember) =>
  member.relation
    ? JSON.stringify([member.relation.kind, member.relation.id])
    : null;
const facts = (member: ActivityMember) => ({
  failed: Number(member.state === "failed"),
  aborted: Number(member.state === "aborted"),
  running: Number(member.state === "streaming"),
  changedFiles: member.changedFiles ?? 0,
});
/** Native result evidence only. Intent paths do not prove a completed mutation. */
export const reportedChanges = (semantic: ToolSemantic | undefined) =>
  semantic?.kind === "file-change" && semantic.phase === "result"
    ? semantic.changes.filter((change) => !change.failed)
    : [];
export const reportedChangeCount = (
  semantic: ToolSemantic | undefined,
): number => reportedChanges(semantic).length;

/** Thread-owned reading projection. It stores small membership facts, never another body or scheduler. */
export class ActivityReadModel {
  private readonly store = createActivityStore();
  readonly stateStore: Pick<
    ReturnType<typeof createActivityStore>,
    "getState" | "getInitialState" | "subscribe"
  > = this.store;
  private members = new Map<string, ActivityMember>();
  private membership = new Map<string, number>();
  private groups = new ItemIndex<ActivityGroup>();
  private slots: ActivityRow[] = [];
  private nextId = 1;
  private aliases = new Map<number, number>();
  private protectedKeys: ReadonlySet<string> = new Set();
  private pending: readonly ActivityMember[] | undefined;
  private pendingFacts = new Map<
    string,
    Pick<ActivityMember, "state" | "changedFiles">
  >();
  private anchor: string | undefined;
  private visible: number | undefined;

  groupFor(key: string): number | undefined {
    return this.membership.get(key);
  }
  resolveGroup(id: number): number {
    const visited = new Set<number>();
    while (this.aliases.has(id) && !visited.has(id)) {
      visited.add(id);
      id = this.aliases.get(id) ?? id;
    }
    return id;
  }
  setReadingAnchor(key: string, visible?: number): void {
    this.anchor = key;
    this.visible = visible;
  }
  setProtected(keys: ReadonlySet<string>): void {
    const released = [...this.protectedKeys].some((key) => !keys.has(key));
    this.protectedKeys = keys;
    if (released && this.pending) {
      const pending = this.pending.map((member) => ({
        ...member,
        ...this.pendingFacts.get(member.key),
      }));
      this.pending = undefined;
      this.pendingFacts.clear();
      this.reconcile(pending);
    }
  }
  /** Freeze only connected old/new grouping components touched by selection or focus. */
  private protectStructure(
    input: readonly ActivityMember[],
  ): readonly ActivityMember[] {
    const edges = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!edges.has(a)) edges.set(a, new Set());
      if (!edges.has(b)) edges.set(b, new Set());
      edges.get(a)?.add(b);
      edges.get(b)?.add(a);
    };
    const connect = (members: readonly ActivityMember[]) => {
      for (let i = 1; i < members.length; i++) {
        const a = members[i - 1],
          b = members[i];
        if (a && b && relationKey(a) && relationKey(a) === relationKey(b))
          link(a.key, b.key);
      }
    };
    const previous = [...this.members.values()];
    connect(previous);
    connect(input);
    const seeds = [...this.protectedKeys].flatMap((key) => {
      const slot = this.slots.find((row) => row.key === key);
      return slot?.kind === "group"
        ? (this.groups.get(slot.id)?.members ?? [])
        : [key];
    });
    const componentFor = new Map<string, number>();
    let serial = 0;
    for (const seed of seeds) {
      if (
        componentFor.has(seed) ||
        (!this.members.has(seed) && !edges.has(seed))
      )
        continue;
      const id = serial++;
      const queue = [seed];
      componentFor.set(seed, id);
      for (let i = 0; i < queue.length; i++)
        for (const key of edges.get(queue[i] ?? "") ?? [])
          if (!componentFor.has(key)) {
            componentFor.set(key, id);
            queue.push(key);
          }
    }
    const oldComponents = new Map<number, ActivityMember[]>();
    const incoming = new Map(input.map((member) => [member.key, member]));
    for (const old of previous) {
      const id = componentFor.get(old.key);
      if (id === undefined) continue;
      const next = incoming.get(old.key);
      const members = oldComponents.get(id) ?? [];
      members.push({
        ...old,
        state: next?.state ?? old.state,
        changedFiles: next?.changedFiles ?? old.changedFiles ?? 0,
      });
      oldComponents.set(id, members);
    }
    const emitted = new Set<number>();
    const safe: ActivityMember[] = [];
    for (const member of input) {
      const id = componentFor.get(member.key);
      if (id === undefined) safe.push(member);
      else {
        if (!emitted.has(id)) {
          safe.push(...(oldComponents.get(id) ?? []));
          emitted.add(id);
        }
        // New calls remain readable while their move into the protected group waits.
        if (!this.members.has(member.key))
          safe.push({
            key: member.key,
            state: member.state,
            changedFiles: member.changedFiles ?? 0,
          });
      }
    }
    return safe;
  }
  reconcile(input: readonly ActivityMember[]): void {
    const previous = [...this.members.values()];
    if (this.protectedKeys.size) {
      const safe = this.protectStructure(input);
      this.pending = input;
      this.pendingFacts.clear();
      input = safe;
    }
    const structural =
      input.length !== previous.length ||
      input.some(
        (member, i) =>
          member.key !== previous[i]?.key ||
          relationKey(member) !==
            (previous[i] ? relationKey(previous[i]) : null),
      );
    if (!structural) {
      for (const member of input) this.update(member);
      return;
    }
    const previousMembership = this.membership;
    const oldGroups = this.groups;
    const nextGroups = new Map<number, ActivityGroup>();
    const claimed = new Set<number>();
    this.membership = new Map();
    this.members = new Map(input.map((member) => [member.key, member]));
    this.slots = [];
    const anchorGroup = this.anchor
      ? previousMembership.get(this.anchor)
      : undefined;
    for (let i = 0; i < input.length; ) {
      const first = input[i];
      if (!first) break;
      const relation = relationKey(first);
      let end = i + 1;
      if (relation)
        while (
          end < input.length &&
          relationKey(input[end] ?? first) === relation
        )
          end++;
      const segment = input.slice(i, end);
      if (!first.relation || segment.length < 2) {
        this.slots.push({ kind: "member", key: first.key });
        i = end;
        continue;
      }
      const keys = segment.map((member) => member.key);
      const candidates = [
        ...new Set(
          keys.flatMap((key) => {
            const id = previousMembership.get(key);
            return id === undefined ? [] : [id];
          }),
        ),
      ];
      const retained = [anchorGroup, this.visible, ...candidates].find(
        (id) =>
          id !== undefined &&
          candidates.includes(id) &&
          !claimed.has(id) &&
          (id !== anchorGroup || !this.anchor || keys.includes(this.anchor)),
      );
      const id = retained ?? this.nextId++;
      claimed.add(id);
      const old = oldGroups.get(id);
      const group: ActivityGroup = {
        id,
        key: old?.key ?? `activity:${id}`,
        relation: first.relation,
        members: keys,
        count: segment.length,
        failed: 0,
        aborted: 0,
        running: 0,
        changedFiles: 0,
        expanded:
          old?.expanded ??
          candidates.some((candidate) => oldGroups.get(candidate)?.expanded),
      };
      for (const member of segment) {
        const delta = facts(member);
        group.failed += delta.failed;
        group.aborted += delta.aborted;
        group.running += delta.running;
        group.changedFiles += delta.changedFiles;
        this.membership.set(member.key, id);
      }
      nextGroups.set(id, group);
      this.slots.push({ kind: "group", key: group.key, id });
      i = end;
    }
    // Aliases only cover merged groups; split anchors retain their original group directly.
    for (const [key, old] of previousMembership) {
      const next = this.membership.get(key);
      if (next !== undefined && next !== old && !nextGroups.has(old))
        this.aliases.set(old, next);
    }
    while (this.aliases.size > 64) {
      const first = this.aliases.keys().next().value;
      if (first === undefined) break;
      this.aliases.delete(first);
    }
    this.groups = new ItemIndex<ActivityGroup>();
    for (const group of nextGroups.values())
      this.groups = this.groups.with(group);
    this.publishRows();
  }
  /** O(log groups): one member and its group summary; row order and other groups keep references. */
  update(member: ActivityMember): void {
    if (this.pending)
      this.pendingFacts.set(member.key, {
        state: member.state,
        changedFiles: member.changedFiles ?? 0,
      });
    const previous = this.members.get(member.key);
    if (!previous) return;
    this.members.set(member.key, {
      ...previous,
      state: member.state,
      changedFiles: member.changedFiles ?? 0,
    });
    const id = this.membership.get(member.key);
    if (id === undefined) return;
    const group = this.groups.get(id);
    if (!group) return;
    const before = facts(previous),
      after = facts(member);
    if (
      before.failed === after.failed &&
      before.aborted === after.aborted &&
      before.running === after.running &&
      before.changedFiles === after.changedFiles
    )
      return;
    this.groups = this.groups.with({
      ...group,
      failed: group.failed + after.failed - before.failed,
      aborted: group.aborted + after.aborted - before.aborted,
      running: group.running + after.running - before.running,
      changedFiles:
        group.changedFiles + after.changedFiles - before.changedFiles,
    });
    this.store.setState({ groups: this.groups });
  }
  setExpanded(id: number, expanded: boolean): void {
    id = this.resolveGroup(id);
    const group = this.groups.get(id);
    if (!group || group.expanded === expanded) return;
    this.groups = this.groups.with({ ...group, expanded });
    this.publishRows();
  }
  revealMember(key: string): void {
    const id = this.membership.get(key);
    if (id !== undefined) this.setExpanded(id, true);
  }
  private publishRows(): void {
    const rows = this.slots.flatMap((row) =>
      row.kind === "group" && this.groups.get(row.id)?.expanded
        ? [
            row,
            ...(this.groups.get(row.id)?.members ?? []).map((key) => ({
              kind: "member" as const,
              key,
            })),
          ]
        : [row],
    );
    this.store.setState({ groups: this.groups, rows });
  }
}

import { type ComponentProps, useLayoutEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import type { ConversationItem } from "../../../modules/conversation/contracts/public";
import {
  type ActivityMember,
  type ActivityReadModel,
  type ConversationModel,
  reportedChangeCount,
} from "../../../modules/conversation/core/public";
import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
} from "../../../modules/ui/renderer/public";
import { ReadingWindow, readingWindow } from "./reading-window";

export function activityMember(
  key: string,
  item: Pick<ConversationItem, "state" | "tool"> | undefined,
  parentId?: string,
): ActivityMember {
  return {
    key,
    state: item?.state ?? "complete",
    ...(parentId
      ? { relation: { kind: "native-call-batch", id: parentId } }
      : {}),
    changedFiles: reportedChangeCount(item?.tool?.semantic),
  };
}

/** Membership arrives only on identity/history changes; token updates go directly to entity selectors. */
export function ActivityReadingWindow({
  model,
  members,
  liveKeys,
  rows,
  renderRow,
  ...props
}: ComponentProps<typeof ReadingWindow> & {
  model: ConversationModel;
  members: readonly ActivityMember[];
  liveKeys: ReadonlyMap<number, string>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const activity = model.activities;
  const activityRows = useStore(activity.stateStore, (state) => state.rows);
  const byKey = useMemo(
    () => new Map(rows.map((row, index) => [row.id, { row, index }])),
    [rows],
  );
  const activityByKey = useMemo(
    () => new Map(activityRows.map((row) => [row.key, row])),
    [activityRows],
  );
  const interaction = useRef(() => {});
  const syncInteraction = () => {
    const element = root.current;
    if (!element) return;
    const selection = document.getSelection();
    const ranges =
      selection && !selection.isCollapsed
        ? Array.from({ length: selection.rangeCount }, (_, i) =>
            selection.getRangeAt(i),
          )
        : [];
    const keys = new Set<string>();
    for (const node of element.querySelectorAll<HTMLElement>(
      "[data-reading-row]",
    ))
      if (
        (document.activeElement && node.contains(document.activeElement)) ||
        ranges.some((range) => range.intersectsNode(node))
      )
        keys.add(node.dataset.readingRow ?? "");
    const pane = element.closest<HTMLElement>("[data-reading-pane]");
    const key = pane ? readingWindow(pane)?.currentRow()?.id : undefined;
    if (key) {
      const group = activityByKey.get(key);
      activity.setReadingAnchor(
        group?.kind === "group"
          ? (activity.stateStore.getState().groups.get(group.id)?.members[0] ??
              key)
          : key,
        group?.kind === "group" ? group.id : activity.groupFor(key),
      );
    }
    activity.setProtected(keys);
  };
  interaction.current = syncInteraction;
  useLayoutEffect(() => {
    syncInteraction();
    model.configureActivities(members, liveKeys);
  }, [model, members, liveKeys]);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const listener = () => queueMicrotask(() => interaction.current());
    document.addEventListener("selectionchange", listener);
    element.addEventListener("focusin", listener);
    element.addEventListener("focusout", listener);
    return () => {
      document.removeEventListener("selectionchange", listener);
      element.removeEventListener("focusin", listener);
      element.removeEventListener("focusout", listener);
      activity.setProtected(new Set());
    };
  }, [activity]);
  return (
    <div ref={root}>
      <ReadingWindow
        {...props}
        rows={activityRows.flatMap((row) => {
          if (row.kind === "group") return [{ id: row.key }];
          const original = byKey.get(row.key);
          return original ? [original.row] : [];
        })}
        renderRow={(row) => {
          const group = activityByKey.get(row.id);
          if (group?.kind === "group")
            return <ActivityGroupRow model={activity} id={group.id} />;
          const original = byKey.get(row.id);
          return original ? renderRow(original.row, original.index) : null;
        }}
      />
    </div>
  );
}

function ActivityGroupRow({
  model,
  id,
}: {
  model: ActivityReadModel;
  id: number;
}) {
  const { t } = useI18n();
  const group = useStore(model.stateStore, (state) => state.groups.get(id));
  if (!group) return null;
  return (
    <article
      className="message message-tool"
      data-activity-group={id}
      data-reading-row={group.key}
    >
      <Button
        variant="ghost"
        appearance="plain"
        aria-expanded={group.expanded}
        data-reading-light-expansion
        onClick={() => model.setExpanded(id, !group.expanded)}
      >
        {group.expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        {t("activity.callBatch", { count: group.count })}
      </Button>
      {group.failed > 0 && (
        <small role="status">
          {t("activity.failed", { count: group.failed })}
        </small>
      )}
      {group.aborted > 0 && (
        <small role="status">
          {t("activity.aborted", { count: group.aborted })}
        </small>
      )}
      {group.running > 0 && (
        <small role="status">
          {t("activity.running", { count: group.running })}
        </small>
      )}
      {group.changedFiles > 0 && (
        <small>
          {t("activity.reportedPaths", { count: group.changedFiles })}
        </small>
      )}
    </article>
  );
}

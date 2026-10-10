import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { type CSSProperties, type ReactNode, useState } from "react";
import { useI18n } from "../../../modules/preferences/renderer/public";
import { useSidebarPreview } from "./sidebar-preview";
export type SidebarDragBindings = Pick<
  ReturnType<typeof useSortable>,
  "listeners" | "setActivatorNodeRef"
> & {
  attributes: Omit<
    ReturnType<typeof useSortable>["attributes"],
    "aria-disabled"
  >;
  dragging: boolean;
};
export function movedBefore(
  keys: readonly string[],
  active: string,
  over: string,
  afterLast: string | null = null,
): string | null | undefined {
  const from = keys.indexOf(active),
    to = keys.indexOf(over);
  if (from < 0 || to < 0 || from === to) return undefined;
  return arrayMove([...keys], from, to)[to + 1] ?? afterLast;
}
// Each project owns one sorting scope. The row itself is the activator.
export function SidebarSortableList<T>({
  entries,
  itemKey,
  label,
  disabled,
  afterLast = null,
  onMove,
  render,
}: {
  entries: readonly T[];
  itemKey: (item: T) => string;
  label: (item: T) => string;
  disabled: boolean;
  afterLast?: string | null;
  onMove: (key: string, before: string | null) => void;
  render: (item: T, drag: SidebarDragBindings) => ReactNode;
}) {
  const { t } = useI18n();
  const preview = useSidebarPreview();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 260, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const [active, setActive] = useState<string | null>(null);
  const keys = entries.map(itemKey),
    labels = new Map(entries.map((item) => [itemKey(item), label(item)]));
  const name = (id: string | number) =>
    labels.get(String(id)) ?? t("app.sidebar.untitled");
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{
        screenReaderInstructions: {
          draggable: t("app.sidebar.dragInstructions"),
        },
        announcements: {
          onDragStart: ({ active }) =>
            t("app.sidebar.dragStart", { name: name(active.id) }),
          onDragOver: ({ active, over }) =>
            over
              ? t("app.sidebar.dragOver", {
                  name: name(active.id),
                  target: name(over.id),
                })
              : undefined,
          onDragEnd: ({ active }) =>
            t("app.sidebar.dragEnd", { name: name(active.id) }),
          onDragCancel: () => t("app.sidebar.dragCancel"),
        },
      }}
      onDragStart={({ active }) => {
        setActive(String(active.id));
        preview?.block(true);
      }}
      onDragCancel={() => {
        setActive(null);
        preview?.block(false);
      }}
      onDragEnd={({ active, over }) => {
        setActive(null);
        preview?.block(false);
        if (disabled || !over) return;
        const before = movedBefore(
          keys,
          String(active.id),
          String(over.id),
          afterLast,
        );
        if (before !== undefined) onMove(String(active.id), before);
      }}
    >
      <SortableContext items={keys} strategy={verticalListSortingStrategy}>
        {entries.map((item) => (
          <SortableRow
            key={itemKey(item)}
            id={itemKey(item)}
            disabled={disabled || entries.length < 2}
          >
            {(drag) => render(item, drag)}
          </SortableRow>
        ))}
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {active ? (
          <div className="sidebar-drag-overlay">{labels.get(active)}</div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
function SortableRow({
  id,
  disabled,
  children,
}: {
  id: string;
  disabled: boolean;
  children: (drag: SidebarDragBindings) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
  } = useSortable({ id, disabled, transition: null });
  const { "aria-disabled": _draggableDisabled, ...navigationAttributes } =
    attributes;
  const geometry: CSSProperties & {
    "--sidebar-transform": string | undefined;
  } = { "--sidebar-transform": CSS.Transform.toString(transform) };
  return (
    <div
      ref={setNodeRef}
      className="sidebar-sortable"
      data-dragging={isDragging || undefined}
      style={geometry}
    >
      {children({
        attributes: navigationAttributes,
        listeners,
        setActivatorNodeRef,
        dragging: isDragging,
      })}
    </div>
  );
}

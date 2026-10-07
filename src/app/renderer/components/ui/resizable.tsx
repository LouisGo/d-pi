import { type ReactNode, useEffect, useRef } from "react";
import {
  Group,
  type GroupImperativeHandle,
  Panel,
  type PanelImperativeHandle,
  Separator,
} from "react-resizable-panels";
// External panel types/config stay here; consumers specify project geometry only.
export function ResizableSplit({
  id,
  axis,
  side,
  size,
  min,
  max,
  visible,
  label,
  onCommit,
  children,
  auxiliary,
}: {
  id: string;
  axis: "horizontal" | "vertical";
  side: "start" | "end";
  size: number;
  min: number;
  max: number;
  visible: boolean;
  label: string;
  onCommit: (size: number) => void;
  children: ReactNode;
  auxiliary: ReactNode;
}) {
  const group = useRef<GroupImperativeHandle>(null);
  const panel = useRef<PanelImperativeHandle>(null);
  const separator = useRef<HTMLDivElement>(null);
  const element = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    layout: Record<string, number>;
    pointerId: number;
  } | null>(null);
  const cancelled = useRef(false);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    // The library refreshes its cached axis size through ResizeObserver.
    // Reapply controlled pixels after that refresh, including parent layout
    // changes that do not change this split's props.
    const host = element.current;
    if (!host) return;
    let frame = 0;
    let observedSize: number | undefined;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() =>
        panel.current?.resize(visible ? size : 0),
      );
    };
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const next =
        axis === "horizontal"
          ? entry.contentRect.width
          : entry.contentRect.height;
      if (next === observedSize) return;
      observedSize = next;
      schedule();
    });
    observer.observe(host);
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [axis, size, visible, min, max]);
  useEffect(() => {
    const owner = element.current?.ownerDocument;
    if (!owner) return;
    const cancel = () => {
      const initial = gesture.current;
      if (!initial) return;
      cancelled.current = true;
      gesture.current = null;
      // 4.14.2 listens for document pointerup, not pointercancel. End its
      // gesture through that event, then restore via the public group API.
      owner.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: initial.pointerId,
          buttons: 0,
        }),
      );
      group.current?.setLayout(initial.layout);
      queueMicrotask(() => {
        cancelled.current = false;
      });
    };
    const up = () => {
      gesture.current = null;
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    owner.addEventListener("pointercancel", cancel, true);
    owner.addEventListener("lostpointercapture", cancel, true);
    owner.addEventListener("pointerup", up);
    owner.addEventListener("keydown", key);
    owner.defaultView?.addEventListener("blur", cancel);
    return () => {
      cancel();
      owner.removeEventListener("pointercancel", cancel, true);
      owner.removeEventListener("lostpointercapture", cancel, true);
      owner.removeEventListener("pointerup", up);
      owner.removeEventListener("keydown", key);
      owner.defaultView?.removeEventListener("blur", cancel);
    };
  }, []);
  const auxiliaryPanel = (
    <Panel
      id={`${id}-aux`}
      panelRef={panel}
      collapsible
      collapsedSize={0}
      defaultSize={visible ? size : 0}
      minSize={visible ? min : 0}
      maxSize={visible ? max : 0}
      groupResizeBehavior="preserve-pixel-size"
    >
      <div className="ui-panel" aria-hidden={!visible} inert={!visible}>
        {auxiliary}
      </div>
    </Panel>
  );
  const mainPanel = (
    <Panel id={`${id}-main`} minSize="0%">
      <div className="ui-panel">{children}</div>
    </Panel>
  );
  return (
    <Group
      id={id}
      orientation={axis}
      className="ui-split"
      elementRef={element}
      groupRef={group}
      resizeTargetMinimumSize={{ fine: 8, coarse: 20 }}
      onKeyDownCapture={() => {
        if (!gesture.current) cancelled.current = false;
      }}
      onPointerDownCapture={(event) => {
        if (event.button !== 0 || !event.isPrimary) return;
        const target = event.target;
        if (
          !(target instanceof Element) ||
          target.closest("[data-group]") !== element.current ||
          !target.closest("[role=separator]")
        )
          return;
        cancelled.current = false;
        gesture.current = {
          layout: group.current?.getLayout() ?? {},
          pointerId: event.pointerId,
        };
      }}
      onLayoutChanged={(layout, meta) => {
        if (!meta.isUserInteraction || cancelled.current) return;
        const host = element.current?.getBoundingClientRect();
        const gutter = separator.current?.getBoundingClientRect();
        const percentage = layout[`${id}-aux`];
        if (!host || !gutter || percentage === undefined) return;
        // Keyboard commits precede React DOM updates; use the committed
        // library layout, never the previous painted panel size.
        const available =
          axis === "horizontal"
            ? host.width - gutter.width
            : host.height - gutter.height;
        commit.current((available * percentage) / 100);
      }}
    >
      {side === "start" ? auxiliaryPanel : mainPanel}
      <Separator
        id={`${id}-separator`}
        elementRef={separator}
        className="ui-resize-separator"
        disabled={!visible}
        disableDoubleClick
        aria-label={label}
      />
      {side === "start" ? mainPanel : auxiliaryPanel}
    </Group>
  );
}

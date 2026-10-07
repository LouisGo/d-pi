export type Region = "sidebar" | "workspace" | "bottom";
export type LayoutIntent = Record<Region, { open: boolean; size: number }>;
export type LayoutConstraints = {
  separator: number;
  sidebarMin: number;
  sidebarMax: number;
  conversationMin: number;
  workspaceMin: number;
  workspaceMax: number;
  bottomMin: number;
  conversationMinHeight: number;
};
export type RegionGeometry = {
  visible: boolean;
  size: number;
  max: number;
  temporary: boolean;
};
export type WorkbenchGeometry = Record<Region, RegionGeometry>;
const clamp = (size: number, min: number, max: number) =>
  Math.min(max, Math.max(min, size));
export function solveGeometry(
  box: { width: number; height: number },
  intent: LayoutIntent,
  c: LayoutConstraints,
  content: { workspace: boolean; bottom: boolean },
): WorkbenchGeometry {
  const width = Math.max(0, box.width);
  let left = intent.sidebar.open;
  let right = intent.workspace.open && content.workspace;
  if (
    width <
    c.conversationMin +
      (left ? c.sidebarMin + c.separator : 0) +
      (right ? c.workspaceMin + c.separator : 0)
  )
    left = false;
  if (width < c.conversationMin + (right ? c.workspaceMin + c.separator : 0))
    right = false;
  const leftMax = Math.min(
    c.sidebarMax,
    Math.max(c.sidebarMin, width * 0.3),
    width -
      c.conversationMin -
      (right ? c.workspaceMin + c.separator : 0) -
      c.separator,
  );
  const leftSize = left ? clamp(intent.sidebar.size, c.sidebarMin, leftMax) : 0;
  const rightMax = Math.min(
    c.workspaceMax,
    width -
      leftSize -
      c.conversationMin -
      c.separator -
      (left ? c.separator : 0),
  );
  const bottomMax = Math.min(
    box.height * 0.55,
    box.height - c.conversationMinHeight - c.separator,
  );
  const bottom =
    intent.bottom.open && content.bottom && bottomMax >= c.bottomMin;
  return {
    sidebar: {
      visible: left,
      size: leftSize,
      max: Math.max(0, leftMax),
      temporary: intent.sidebar.open && !left,
    },
    workspace: {
      visible: right,
      size: right ? clamp(intent.workspace.size, c.workspaceMin, rightMax) : 0,
      max: Math.max(0, rightMax),
      temporary: intent.workspace.open && content.workspace && !right,
    },
    bottom: {
      visible: bottom,
      size: bottom ? clamp(intent.bottom.size, c.bottomMin, bottomMax) : 0,
      max: Math.max(0, bottomMax),
      temporary: intent.bottom.open && content.bottom && !bottom,
    },
  };
}

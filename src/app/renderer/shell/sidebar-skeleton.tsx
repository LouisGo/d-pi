import { useI18n } from "../../../modules/preferences/renderer/public";
import {
  NavigationSection,
  Skeleton,
} from "../../../modules/ui/renderer/public";

export type SidebarDiscoveryState = "loading" | "unavailable" | "settled";
const threadShapes = ["long", "medium", "short", "long", "medium"] as const;

export function SidebarThreadSkeleton() {
  return (
    <div data-sidebar-thread-skeleton aria-hidden="true">
      {threadShapes.map((shape, index) => (
        <div className="sidebar-skeleton-row" key={`${shape}-${index}`}>
          <Skeleton data-length={shape} />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the actual project heading, icon column and indented five-row preview. */
export function SidebarSkeleton({ collapsed }: { collapsed: boolean }) {
  const { t } = useI18n();
  return (
    <NavigationSection
      data-sidebar-skeleton
      aria-hidden="true"
      label={t("app.sidebar.projects")}
      expanded={!collapsed}
    >
      <div className="sidebar-section-items">
        {["short", "medium", "short"].map((shape, index) => (
          <div className="sidebar-project-group" key={`${shape}-${index}`}>
            <div className="sidebar-skeleton-row">
              <Skeleton shape="icon" />
              <Skeleton data-length={shape} />
            </div>
            <div className="sidebar-project-children">
              <SidebarThreadSkeleton />
            </div>
          </div>
        ))}
      </div>
    </NavigationSection>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { ComponentDashboard } from "../developer/components/component-dashboard";
import { HoverMenuPreview } from "../developer/hover-menu-preview";

export const Route = createFileRoute("/dev/components")({
  // i18n-ignore: developer workspace uses fixed Chinese by user request
  staticData: { workspace: "developer", title: "组件看板" },
  component: DeveloperPage,
});
function DeveloperPage() {
  return <ComponentDashboard additionalPreview={<HoverMenuPreview />} />;
}

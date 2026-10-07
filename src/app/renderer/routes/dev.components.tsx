import { createFileRoute } from "@tanstack/react-router";
import { ComponentDashboard } from "../developer/components/component-dashboard";
import { HoverMenuPreview } from "../developer/hover-menu-preview";

export const Route = createFileRoute("/dev/components")({
  component: DeveloperPage,
});
function DeveloperPage() {
  return <ComponentDashboard additionalPreview={<HoverMenuPreview />} />;
}

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { ApplicationLayout } from "../app-layout";
import type { RoutingContext } from "../routing/context";

export const Route = createRootRouteWithContext<RoutingContext>()({
  component: Root,
});
function Root() {
  const { model } = Route.useRouteContext();
  return (
    <ApplicationLayout model={model}>
      <Outlet />
    </ApplicationLayout>
  );
}

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { RoutingContext } from "../routing/context";
import { ApplicationLayout } from "../shell/application-layout";

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

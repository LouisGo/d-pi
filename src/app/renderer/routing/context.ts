import type { AppModel } from "../wiring/model";

export type RoutingContext = { model: AppModel };

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    workspace?: "developer";
    title?: string;
  }
}

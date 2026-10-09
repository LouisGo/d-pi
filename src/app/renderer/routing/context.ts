import type { MessageKey } from "../../../shared/i18n/create-i18n";
import type { AppModel } from "../wiring/model";

export type RoutingContext = { model: AppModel };

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    workspace?: "developer";
    titleMessage?: MessageKey;
  }
}

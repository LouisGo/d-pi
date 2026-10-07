import { createContext } from "react";
import type { WorkspaceHost } from "./workbench-frame";
export type WorkbenchHosts = {
  workspace?: WorkspaceHost;
  bottom?: WorkspaceHost;
};
// Explicit app composition input; no registration platform or business resources.
export const WorkbenchHostsContext = createContext<WorkbenchHosts>({});

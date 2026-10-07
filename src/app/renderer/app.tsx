import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createAppRouting } from "./routing/router";
import {
  type WorkbenchHosts,
  WorkbenchHostsContext,
} from "./shell/layout/hosts-context";
import { EditorAdapterContext } from "./workbench/editor-context";
import type { WorkbenchProps } from "./workbench/types";

export function App({
  model,
  editor,
  hosts,
}: WorkbenchProps & { hosts?: WorkbenchHosts }) {
  const [routing] = useState(() => createAppRouting(model));
  useEffect(() => routing.connect(), [routing]);
  return (
    <EditorAdapterContext value={editor}>
      <WorkbenchHostsContext value={hosts ?? {}}>
        <RouterProvider router={routing.router} />
      </WorkbenchHostsContext>
    </EditorAdapterContext>
  );
}

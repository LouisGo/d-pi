import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createAppRouting } from "./routing/router";
import { EditorAdapterContext } from "./workbench/editor-context";
import type { WorkbenchProps } from "./workbench/types";

export function App({ model, editor }: WorkbenchProps) {
  const [routing] = useState(() => createAppRouting(model));
  useEffect(() => routing.connect(), [routing]);
  return (
    <EditorAdapterContext value={editor}>
      <RouterProvider router={routing.router} />
    </EditorAdapterContext>
  );
}

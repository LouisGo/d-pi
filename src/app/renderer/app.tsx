import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { WorkbenchProps } from "./app-layout";
import { createAppRouting } from "./routing/router";
import { EditorAdapterContext } from "./workbench/editor-context";

export function App({ model, editor }: WorkbenchProps) {
  const [routing] = useState(() => createAppRouting(model));
  useEffect(() => routing.connect(), [routing]);
  return (
    <EditorAdapterContext value={editor}>
      <RouterProvider router={routing.router} />
    </EditorAdapterContext>
  );
}

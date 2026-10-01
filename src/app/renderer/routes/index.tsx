import { createFileRoute } from "@tanstack/react-router";
import { useStore } from "zustand";
import { EmptyWorkbench } from "../shell/empty-workbench";

export const Route = createFileRoute("/")({ component: Index });
function Index() {
  const { model } = Route.useRouteContext();
  const empty = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadSelection.kind === "empty",
  );
  return empty ? <EmptyWorkbench model={model} /> : null;
}

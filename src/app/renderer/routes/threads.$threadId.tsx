import { createFileRoute } from "@tanstack/react-router";
import { useContext } from "react";
import { useStore } from "zustand";
import { ThreadIdSchema } from "../../../shared/identity";
import { readingSearch } from "../routing/search";
import { EditorAdapterContext } from "../workbench/editor-context";
import { ThreadWorkbench } from "../workbench/thread-workbench";

export const Route = createFileRoute("/threads/$threadId")({
  params: {
    parse: (params) => ({ threadId: ThreadIdSchema.parse(params.threadId) }),
  },
  validateSearch: readingSearch,
  component: ThreadPage,
});
function ThreadPage() {
  const { model } = Route.useRouteContext();
  const editor = useContext(EditorAdapterContext);
  const { threadId } = Route.useParams();
  const view = Route.useSearch({ select: (search) => search.view });
  const navigate = Route.useNavigate();
  const selection = useStore(model.stateStore, (state) =>
    state.kind === "ready" &&
    state.threadTransition !== "unknown" &&
    state.threadSelection.kind === "thread" &&
    state.threadSelection.thread.context.threadId === threadId
      ? state.threadSelection
      : null,
  );
  if (!selection) return null;
  return (
    <ThreadWorkbench
      key={selection.thread.key}
      model={model}
      editor={editor}
      threadSelection={selection}
      readingView={view}
      onReadingViewChange={(view) =>
        void navigate({ search: { view }, replace: true })
      }
    />
  );
}

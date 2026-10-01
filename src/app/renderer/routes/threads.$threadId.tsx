import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useContext, useState } from "react";
import { useStore } from "zustand";
import { ThreadIdSchema } from "../../../shared/identity";
import { type ReadingView, readingSearch } from "../routing/search";
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
  const onReadingViewChange = useCallback(
    (view: ReadingView) => {
      void navigate({ search: { view }, replace: true });
    },
    [navigate],
  );
  const selection = useStore(model.stateStore, (state) =>
    state.kind === "ready" &&
    state.threadTransition !== "unknown" &&
    state.threadSelection.kind === "thread" &&
    state.threadSelection.thread.context.threadId === threadId
      ? state.threadSelection
      : null,
  );
  const known = useStore(
    model.stateStore,
    (state) => state.kind === "ready" && state.threadTransition !== "unknown",
  );
  // Main confirms selection before history commits. Retain only the last view
  // belonging to this still-presented route, frozen until both identities agree.
  // This is a presentation reference, never another writable Thread owner.
  const [presented, setPresented] = useState(selection);
  if (selection && selection !== presented) setPresented(selection);
  const visible =
    selection ??
    (presented?.thread.context.threadId === threadId ? presented : null);
  if (!known || !visible) return null;
  return (
    <ThreadWorkbench
      key={visible.thread.key}
      model={model}
      editor={editor}
      threadSelection={visible}
      transitioning={!selection}
      readingView={view}
      onReadingViewChange={onReadingViewChange}
    />
  );
}

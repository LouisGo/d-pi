import { createRouter, type HistoryLocation } from "@tanstack/react-router";
import { ThreadIdSchema } from "../../../shared/identity";
import type { AppModel } from "../wiring/model";
import { createDesktopHistory } from "./desktop-history";
import { routeTree } from "./route-tree.gen";

export function createAppRouting(model: AppModel) {
  let selecting = false;
  let connected = false;
  let developerThread: string | null = null;
  const history = createDesktopHistory(admit, () => {
    queueMicrotask(() => {
      void router.load();
      synchronize(true);
    });
  });
  const router = createRouter({
    routeTree,
    history,
    context: { model },
    defaultPreload: false,
    defaultPendingMs: 0,
  });

  // commitLocation also covers the SDK's same-location shortcut, which never
  // reaches history. Preserve its inferred signature; refuse overlapping intents
  // before SDK load() can resolve another commit's promise.
  let committing = false;
  let pendingReplace = false;
  const commitLocation = router.commitLocation;
  router.commitLocation = async (...args) => {
    if (committing || selecting) return;
    committing = true;
    try {
      await commitLocation(...args);
      const waitingForSelection = history.isTransitioning();
      await history.whenIdle();
      if (waitingForSelection) await router.load();
    } finally {
      committing = false;
      const replace = pendingReplace || history.location.pathname === "/";
      pendingReplace = false;
      synchronize(replace);
    }
  };

  async function admit(next: HistoryLocation): Promise<boolean> {
    const state = model.getSnapshot();
    if (state.kind !== "ready") return next.pathname === "/";
    if (state.threadTransition === "unknown" || selecting) return false;
    if (next.pathname === "/") return state.threadSelection.kind === "empty";
    const [, rawParams, foundRoute] = router.getMatchedRoutes(next.pathname);
    if (foundRoute?.id === "/dev/components") {
      selecting = true;
      try {
        if (!(await model.prepareViewNavigation())) return false;
        const ready = model.getSnapshot();
        if (ready.kind !== "ready") return false;
        developerThread =
          ready.threadSelection.kind === "thread"
            ? ready.threadSelection.thread.context.threadId
            : null;
        return true;
      } finally {
        selecting = false;
      }
    }
    if (foundRoute?.id !== "/threads/$threadId") return false;
    const parsed = ThreadIdSchema.safeParse(rawParams.threadId);
    if (!parsed.success) return false;
    selecting = true;
    try {
      const result = await model.selectThread(parsed.data);
      return (
        result.kind === "applied" &&
        result.selection.kind === "thread" &&
        result.selection.thread.context.threadId === parsed.data
      );
    } finally {
      selecting = false;
    }
  }
  function synchronize(replace: boolean) {
    if (selecting) return;
    const state = model.getSnapshot();
    if (
      state.kind !== "ready" ||
      state.busy ||
      state.threadTransition === "unknown"
    )
      return;
    if (committing) {
      pendingReplace ||= replace;
      return;
    }
    if (history.location.pathname === "/dev/components") {
      const selected =
        state.threadSelection.kind === "thread"
          ? state.threadSelection.thread.context.threadId
          : null;
      if (selected === developerThread) return;
    }
    if (state.threadSelection.kind === "thread") {
      const threadId = state.threadSelection.thread.context.threadId;
      const [, params] = router.getMatchedRoutes(history.location.pathname);
      if (params.threadId !== threadId)
        void router.navigate({
          to: "/threads/$threadId",
          params: { threadId },
          search: { view: "conversation" },
          replace,
        });
    } else if (history.location.pathname !== "/")
      void router.navigate({ to: "/", replace: true });
  }
  return {
    router,
    connect() {
      if (connected) throw Error("Router already connected");
      connected = true;
      const unsubscribe = model.subscribe(() =>
        synchronize(history.location.pathname === "/"),
      );
      synchronize(true);
      return () => {
        connected = false;
        unsubscribe();
      };
    },
    dispose() {
      history.destroy();
    },
  };
}
export type AppRouter = ReturnType<typeof createAppRouting>["router"];
declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

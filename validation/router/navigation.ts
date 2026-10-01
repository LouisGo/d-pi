import type { AppRouter } from "../../src/app/renderer/routing/router";
import type { ThreadId } from "../../src/shared/identity";

/** Compiled by the real application typecheck; never executed. */
export function verifyNavigationInference(
  router: AppRouter,
  threadId: ThreadId,
) {
  void router.navigate({
    from: "/",
    to: "/threads/$threadId",
    params: { threadId },
    search: { view: "history" },
  });
  void router.navigate({
    from: "/threads/$threadId",
    to: ".",
    search: { view: "files" },
    replace: true,
  });
  void router.navigate({ to: "/" });
  // @ts-expect-error Unknown targets must not become broad strings.
  void router.navigate({ to: "/missing" });
  // @ts-expect-error A Thread route requires its identity.
  void router.navigate({
    from: "/",
    to: "/threads/$threadId",
    search: { view: "history" },
  });
  // @ts-expect-error Incorrect params must be rejected.
  void router.navigate({ to: "/threads/$threadId", params: { threadId: 42 } });
  void router.navigate({
    to: "/threads/$threadId",
    // @ts-expect-error A valid-looking raw string is still unvalidated external identity.
    params: { threadId: "unvalidated" },
  });
  void router.navigate({
    to: "/threads/$threadId",
    // @ts-expect-error Unknown params must be rejected.
    params: { threadId, sessionId: "foreign" },
  });
  void router.navigate({
    to: "/threads/$threadId",
    params: { threadId },
    // @ts-expect-error The reading page is inferred from the Zod schema.
    search: { view: "terminal" },
  });
}

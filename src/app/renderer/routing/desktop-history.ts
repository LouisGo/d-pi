import {
  createMemoryHistory,
  type HistoryLocation,
} from "@tanstack/react-router";

/** Memory history needs admission for POP as well as PUSH/REPLACE (history 1.162.4). */
export function createDesktopHistory(
  admit: (next: HistoryLocation) => Promise<boolean>,
  blocked: () => void,
) {
  const history = createMemoryHistory();
  // A read-only projection of committed entries, needed to inspect a POP target
  // without first changing the underlying memory history's location.
  const locations = new Map([[0, history.location]]);
  const unsubscribe = history.subscribe(({ location, action }) => {
    const index = location.state.__TSR_index;
    if (action.type === "PUSH") {
      for (const key of locations.keys())
        if (key > index) locations.delete(key);
    }
    locations.set(index, location);
  });
  const push = history.push;
  const replace = history.replace;
  const go = history.go;
  const destroy = history.destroy;
  let pending = false;
  let disposed = false;
  let settled = Promise.resolve();
  let finish: (() => void) | undefined;
  async function transition(next: HistoryLocation, commit: () => void) {
    // The in-flight attempt will notify (commit) or load (refusal) and settle
    // all Router commit promises; loading here would settle it prematurely.
    if (pending) return;
    if (disposed) {
      blocked();
      return;
    }
    pending = true;
    settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    try {
      if (await admit(next)) {
        if (!disposed) commit();
      } else blocked();
    } catch {
      blocked();
    } finally {
      pending = false;
      finish?.();
      finish = undefined;
    }
  }
  function target(path: string): HistoryLocation {
    const url = new URL(path, "https://d-pi.invalid");
    return {
      href: path,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      state: history.location.state,
    };
  }
  history.push = (...args) => {
    void transition(target(args[0]), () => push(...args));
  };
  history.replace = (...args) => {
    void transition(target(args[0]), () => replace(...args));
  };
  history.go = (delta, options) => {
    const index = Math.max(
      0,
      Math.min(history.location.state.__TSR_index + delta, history.length - 1),
    );
    const next = locations.get(index);
    if (next) void transition(next, () => go(delta, options));
    else blocked();
  };
  history.back = (options) => history.go(-1, options);
  history.forward = (options) => history.go(1, options);
  history.destroy = () => {
    disposed = true;
    unsubscribe();
    locations.clear();
    destroy();
  };
  return Object.assign(history, {
    whenIdle: () => settled,
    isTransitioning: () => pending,
  });
}

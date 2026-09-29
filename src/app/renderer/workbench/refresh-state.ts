/**
 * One read is "in flight" when it is fetching, or when its key has a first
 * sample that has not started yet. Query reports `isPending` for a query that
 * is disabled by `enabled: false` too, so a disabled query must not count:
 * otherwise the workbench would show a permanent "re-sampling" state for a
 * file or diff that was never selected.
 */
export function readInFlight(state: {
  isPending: boolean;
  isFetching: boolean;
  isEnabled: boolean;
}): boolean {
  return state.isFetching || (state.isPending && state.isEnabled);
}

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * One query client per renderer process, created by the application entry and
 * not by a view. Views only read and invalidate; they never own the cache
 * lifecycle, so unmounting a panel cannot stop or restart background work.
 *
 * Defaults are chosen for an IPC-backed desktop read path rather than a web
 * page:
 * - `staleTime: 0`: a mount re-samples the source, so the visible content
 *   matches the disk unless the view explicitly reuses a cached entry.
 * - `refetchOnWindowFocus: false`: focusing the window is not a reason to
 *   re-read project files or Git; refresh stays an explicit action.
 * - `retry: 3`: read-only sampling may retry transient failures.
 *
 * Query is never used for `D-24` side effects. Sending, answering, stopping,
 * resuming and saving stay on direct commands, and mutations are deliberately
 * unused, because a mutation would be paused while offline and then resumed
 * automatically on reconnect — an automatic re-send of an unknown result.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: 5 * 60 * 1000,
      retry: 3,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

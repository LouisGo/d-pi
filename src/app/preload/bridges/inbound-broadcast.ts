import type { z } from "zod";

interface InboundIpc {
  on(channel: string, handler: (event: unknown, raw: unknown) => void): unknown;
  removeListener(
    channel: string,
    handler: (event: unknown, raw: unknown) => void,
  ): unknown;
}
/** One window-owned validation entry per class of broadcast, with optional identity routing. */
export function createInboundBroadcast<T>(
  ipc: InboundIpc,
  channel: string,
  schema: Pick<z.ZodType<T>, "safeParse">,
  targets: (value: T) => readonly string[] = () => [],
): (listener: (value: T) => void, target?: string) => () => void {
  const global = new Set<(value: T) => void>();
  const routed = new Map<string, Set<(value: T) => void>>();
  let count = 0;
  const handler = (_event: unknown, raw: unknown) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    const value = parsed.data;
    for (const listener of [...global]) listener(value);
    for (const target of new Set(targets(value)))
      for (const listener of [...(routed.get(target) ?? [])]) listener(value);
  };
  return (listener, target) => {
    const listeners =
      target === undefined ? global : (routed.get(target) ?? new Set());
    if (target !== undefined) routed.set(target, listeners);
    // Each registration has independent ownership, including duplicate callbacks.
    const deliver = (value: T) => listener(value);
    listeners.add(deliver);
    if (count++ === 0) ipc.on(channel, handler);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      listeners.delete(deliver);
      if (target !== undefined && !listeners.size) routed.delete(target);
      if (--count === 0) ipc.removeListener(channel, handler);
    };
  };
}

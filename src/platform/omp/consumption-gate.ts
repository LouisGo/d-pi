// The SDK adapter registers wait at the native dequeue boundary. No App queue.
export class ConsumptionGate {
  private readonly reasons = new Set<string>();
  private readonly waiters = new Set<() => void>();
  pause(reason: string): void {
    this.reasons.add(reason);
  }
  resume(reason: string): void {
    this.reasons.delete(reason);
    if (!this.reasons.size) for (const wake of [...this.waiters]) wake();
  }
  async wait(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    while (this.reasons.size) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          this.waiters.delete(wake);
          signal?.removeEventListener("abort", abort);
        };
        const wake = () => {
          cleanup();
          resolve();
        };
        const abort = () => {
          cleanup();
          reject(signal?.reason);
        };
        this.waiters.add(wake);
        signal?.addEventListener("abort", abort, { once: true });
      });
      signal?.throwIfAborted();
    }
  }
}

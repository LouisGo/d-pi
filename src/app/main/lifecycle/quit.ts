/** A user quit request has one bounded lifetime, even if cleanup never settles. */
export class QuitCoordinator {
  private requested = false;
  private finished = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly shutdown: () => Promise<void>,
    private readonly finish: (reason: "clean" | "failed" | "timeout") => void,
  ) {}
  request(): void {
    if (this.requested) return;
    this.requested = true;
    const finish = (reason: "clean" | "failed" | "timeout") => {
      if (this.finished) return;
      this.finished = true;
      clearTimeout(this.timer);
      this.finish(reason);
    };
    this.timer = setTimeout(() => finish("timeout"), 8000);
    void Promise.resolve()
      .then(this.shutdown)
      .then(
        () => finish("clean"),
        () => finish("failed"),
      );
  }
}

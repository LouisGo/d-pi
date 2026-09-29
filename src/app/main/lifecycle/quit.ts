export class QuitCoordinator {
  private timer: ReturnType<typeof setInterval> | undefined;
  private generation = 0;
  constructor(
    private readonly active: () => boolean,
    private readonly stop: () => Promise<void>,
    private readonly finish: () => void,
  ) {}
  request(intent: "wait" | "stop" | "cancel"): void {
    this.dispose();
    if (intent === "cancel") return;
    const generation = this.generation;
    const poll = () => {
      if (generation !== this.generation || this.active()) return;
      this.dispose();
      this.finish();
    };
    const begin = () => {
      if (generation !== this.generation) return;
      this.timer = setInterval(poll, 200);
      poll();
    };
    if (intent === "stop")
      void this.stop()
        .then(begin)
        .catch(() => this.dispose());
    else begin();
  }
  dispose(): void {
    this.generation++;
    clearInterval(this.timer);
    this.timer = undefined;
  }
}

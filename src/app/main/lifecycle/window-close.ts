import { randomUUID } from "node:crypto";

/** One window owns its handshake, timer and recovery notice. */
export class WindowCloseGuard {
  private pending: {
    token: string;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private disposed = false;
  private editable = false;
  private approved = false;
  constructor(
    private readonly actions: {
      send(token: string): void;
      approve(): void;
      blocked(reason: "unsaved" | "unconfirmed"): Promise<void>;
    },
  ) {}
  markEditable(): void {
    this.editable = true;
  }
  request(): boolean {
    if (this.disposed) return false;
    if (this.pending || this.approved) return true;
    if (!this.editable) {
      this.approve();
      return true;
    }
    const token = randomUUID();
    this.pending = {
      token,
      timer: setTimeout(() => {
        this.pending = null;
        this.block("unconfirmed");
      }, 5000),
    };
    this.actions.send(token);
    return true;
  }
  resolve(token: string, saved: boolean): void {
    if (this.disposed || token !== this.pending?.token) return;
    clearTimeout(this.pending.timer);
    this.pending = null;
    if (saved) this.approve();
    else this.block("unsaved");
  }
  private block(reason: "unsaved" | "unconfirmed"): void {
    // Warning delivery must never become a second close permission handshake.
    void this.actions.blocked(reason).catch(() => {});
    this.approve();
  }
  private approve(): void {
    if (this.disposed || this.approved) return;
    this.approved = true;
    this.actions.approve();
  }
  dispose(): void {
    this.disposed = true;
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }
}

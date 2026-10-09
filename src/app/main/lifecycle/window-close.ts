import { randomUUID } from "node:crypto";

/** One window owns its handshake, timer and recovery notice. */
export class WindowCloseGuard {
  private pending: {
    token: string;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private disposed = false;
  private editable = false;
  private noticeOpen = false;
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
    if (this.disposed || this.noticeOpen) return false;
    if (this.pending) return true;
    if (!this.editable) {
      this.actions.approve();
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
    if (saved) this.actions.approve();
    else this.block("unsaved");
  }
  private block(reason: "unsaved" | "unconfirmed"): void {
    this.noticeOpen = true;
    void this.actions
      .blocked(reason)
      .catch(() => {})
      .then(() => {
        this.noticeOpen = false;
      });
  }
  dispose(): void {
    this.disposed = true;
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }
}

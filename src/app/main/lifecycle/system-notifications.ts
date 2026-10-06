import { Notification } from "electron";
export type NotificationCallbacks = {
  click: () => void;
  failed: () => void;
  closed: () => void;
};
export interface SystemNotifications {
  supported(): boolean;
  show(
    text: { title: string; body: string },
    callbacks: NotificationCallbacks,
  ): () => void;
}
export class ElectronSystemNotifications implements SystemNotifications {
  supported(): boolean {
    return Notification.isSupported();
  }
  show(
    text: { title: string; body: string },
    callbacks: NotificationCallbacks,
  ): () => void {
    const notification = new Notification({ ...text, silent: false });
    let released = false;
    const click = () => callbacks.click(),
      failed = () => {
        release();
        callbacks.failed();
        callbacks.closed();
      },
      closed = () => {
        release();
        callbacks.closed();
      };
    const release = () => {
      if (released) return;
      released = true;
      notification.removeListener("click", click);
      notification.removeListener("failed", failed);
      notification.removeListener("close", closed);
      try {
        notification.close();
      } catch {
        /* Native close failure cannot retain App listeners or alter execution. */
      }
    };
    notification.on("click", click);
    notification.on("failed", failed);
    notification.on("close", closed);
    try {
      notification.show();
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }
}

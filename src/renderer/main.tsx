import { createRoot } from "react-dom/client";
import type { DesktopBridge } from "../shared/contracts";
import { App } from "./app";
import { AppModel } from "./model";
import "./styles/app.css";

declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}
const model = new AppModel(window.desktop);
window.desktop.onCloseRequest((token) => {
  void model
    .prepareClose()
    .then((saved) => window.desktop.completeClose(token, saved));
});
window.desktop.onCloseCancelled(() => model.cancelClose());
const root = document.getElementById("root");
if (root) createRoot(root).render(<App model={model} />);
void model.start();

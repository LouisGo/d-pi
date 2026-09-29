import { createRoot } from "react-dom/client";
import {
  browserLocaleFallback,
  I18nProvider,
} from "../../modules/preferences/renderer/public";
import type { DesktopBridge } from "../contracts/desktop-bridge";
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
const initialLocale = await window.desktop.locale
  ?.snapshot()
  .catch(browserLocaleFallback);
if (root)
  createRoot(root).render(
    <I18nProvider
      bridge={window.desktop.locale}
      initialSnapshot={initialLocale ?? browserLocaleFallback()}
    >
      <App model={model} />
    </I18nProvider>,
  );
void model.start();

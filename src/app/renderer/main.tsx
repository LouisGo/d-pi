import { createRoot } from "react-dom/client";
import {
  browserLocaleFallback,
  I18nProvider,
} from "../../modules/preferences/renderer/public";
import { installControlFocusVisibility } from "../../modules/ui/renderer/public";
import type { DesktopBridge } from "../contracts/desktop-bridge";
import { App } from "./app";
import { AppModel } from "./wiring/model";
import { QueryProvider } from "./wiring/query-client";
import { fileEditor } from "./workbench/editor";
import "./styles/app.css";

declare global {
  interface Window {
    desktop: DesktopBridge;
  }
}
const disposeFocusVisibility = installControlFocusVisibility(document);
window.addEventListener("unload", disposeFocusVisibility, { once: true });
const model = new AppModel(window.desktop);
window.addEventListener("unload", () => model.dispose(), { once: true });
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
    <QueryProvider>
      <I18nProvider
        bridge={window.desktop.locale}
        initialSnapshot={initialLocale ?? browserLocaleFallback()}
      >
        <App model={model} editor={fileEditor()} />
      </I18nProvider>
    </QueryProvider>,
  );
void model.start();

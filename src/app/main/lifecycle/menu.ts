import { Menu } from "electron";
import type { createI18n } from "../../../shared/i18n/create-i18n";
export function buildApplicationMenu(
  t: ReturnType<typeof createI18n>["t"],
): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "d-pi",
        submenu: [
          { role: "about", label: t("main.menu.about") },
          { type: "separator" },
          { role: "quit", label: t("main.menu.quit") },
        ],
      },
      {
        label: t("main.menu.edit"),
        submenu: [
          { role: "undo", label: t("main.menu.undo") },
          { role: "redo", label: t("main.menu.redo") },
          { type: "separator" },
          { role: "cut", label: t("main.menu.cut") },
          { role: "copy", label: t("main.menu.copy") },
          { role: "paste", label: t("main.menu.paste") },
          {
            role: "pasteAndMatchStyle",
            label: t("main.menu.pastePlain"),
            accelerator: "CmdOrCtrl+Shift+V",
          },
          { role: "selectAll", label: t("main.menu.selectAll") },
        ],
      },
      {
        label: t("main.menu.window"),
        submenu: [
          { role: "minimize", label: t("main.menu.minimize") },
          { role: "zoom", label: t("main.menu.zoom") },
          { role: "close", label: t("main.menu.close") },
        ],
      },
    ]),
  );
}

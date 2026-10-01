import { app } from "electron";

declare const __D_PI_DEV__: boolean;

export async function prepareDevelopmentTools(): Promise<void> {
  if (typeof __D_PI_DEV__ === "undefined" || !__D_PI_DEV__ || app.isPackaged)
    return;
  try {
    const { installExtension, REACT_DEVELOPER_TOOLS } = await import(
      "electron-devtools-installer"
    );
    const extension = await installExtension(REACT_DEVELOPER_TOOLS);
    console.info(`[devtools] Loaded ${extension.name}`);
  } catch (error: unknown) {
    // Development tooling must not prevent the application from opening.
    console.warn("[devtools] React DevTools could not be loaded:", error);
  }
}

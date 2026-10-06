import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { app, type BrowserWindow } from "electron";
import { z } from "zod";
import {
  type Diagnostics,
  diagnosticCode,
} from "../../../platform/main/diagnostics/public";

const DevelopmentRendererUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
});
export function secureWindow(current: BrowserWindow): void {
  current.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  current.webContents.on("will-navigate", (event) => event.preventDefault());
  current.webContents.on("will-redirect", (event) => {
    if (
      app.isPackaged ||
      !DevelopmentRendererUrlSchema.safeParse(event.url).success
    )
      event.preventDefault();
  });
  current.webContents.on("will-attach-webview", (event) =>
    event.preventDefault(),
  );
  const allowsClipboardWrite = (
    contents: BrowserWindow["webContents"] | null,
    permission: string,
    details: { isMainFrame: boolean; requestingUrl?: string },
  ) =>
    contents === current.webContents &&
    permission === "clipboard-sanitized-write" &&
    details.isMainFrame &&
    details.requestingUrl === current.webContents.getURL();
  current.webContents.session.setPermissionCheckHandler(
    (contents, permission, _origin, details) =>
      allowsClipboardWrite(contents, permission, details),
  );
  current.webContents.session.setPermissionRequestHandler(
    (contents, permission, callback, details) =>
      callback(allowsClipboardWrite(contents, permission, details)),
  );
}
export function loadWindowRenderer(
  current: BrowserWindow,
  mainDirectory: string,
  getWindow: () => BrowserWindow | null,
  getDiagnostics: () => Diagnostics | undefined,
): void {
  // Only the built-in renderer or a local development server receives preload.
  const development = app.isPackaged
    ? undefined
    : DevelopmentRendererUrlSchema.safeParse(process.env.ELECTRON_RENDERER_URL);
  const loadBuiltInRenderer = () => {
    if (getWindow() !== current) return undefined;
    return current.loadFile(join(mainDirectory, "../renderer/index.html"));
  };
  const loading = development?.success
    ? current.loadURL(development.data).catch(loadBuiltInRenderer)
    : loadBuiltInRenderer();
  void loading?.catch((error: unknown) => {
    getDiagnostics()?.record({
      traceId: randomUUID(),
      requestId: randomUUID(),
      connectionId: randomUUID(),
      operation: "window",
      stage: "failed",
      code: diagnosticCode(error) ?? "unknown",
    });
  });
}

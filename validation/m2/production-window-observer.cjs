// Copy this validation-only loader alongside the unchanged production index.js.
// The owned scenario file controls native Hide/Show, not App/OMP execution
// policy. This is the same explicit window-lifecycle input as viewer.cjs uses.
const { app, BrowserWindow } = require("electron");
const {
  appendFileSync,
  readFileSync,
  watch,
  writeFileSync,
} = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");
const root = process.env.D_PI_PERFORMANCE_ROOT;
if (!root) throw Error("Missing owned fixture root");
const log = (event, details = {}) =>
  appendFileSync(
    join(root, "production-window-events.jsonl"),
    JSON.stringify({
      at: Date.now(),
      applicationPid: process.pid,
      event,
      ...details,
    }) + "\n",
  );
app.on("activate", () => log("app.activate"));
app.on("second-instance", () => log("app.second-instance"));
const controlPath = join(root, "production-window-control.json");
writeFileSync(controlPath, JSON.stringify({ kind: "none", nonce: 0 }));
let lastNonce = 0;
const control = watch(controlPath, () => {
  let command;
  try {
    command = JSON.parse(readFileSync(controlPath, "utf8"));
  } catch {
    return;
  }
  if (!Number.isSafeInteger(command.nonce) || command.nonce <= lastNonce)
    return;
  lastNonce = command.nonce;
  if (command.kind === "hide") {
    log("validation.native-hide", { nonce: command.nonce });
    app.hide();
  } else if (command.kind === "show") {
    log("validation.native-show", { nonce: command.nonce });
    for (const window of BrowserWindow.getAllWindows()) window.show();
  }
});
app.on("will-quit", () => control.close());
app.on("browser-window-created", (_event, window) => {
  for (const event of [
    "show",
    "hide",
    "minimize",
    "restore",
    "focus",
    "blur",
    "closed",
  ])
    window.on(event, () => log("window." + event, { windowId: window.id }));
  for (const method of ["show", "restore", "focus", "minimize", "hide"]) {
    const original = window[method];
    window[method] = function (...args) {
      log("window." + method + ".call", { stack: new Error().stack });
      return original.apply(this, args);
    };
  }
});
import(pathToFileURL(join(__dirname, "index.js")).href).catch((error) => {
  console.error(error);
  app.exit(1);
});

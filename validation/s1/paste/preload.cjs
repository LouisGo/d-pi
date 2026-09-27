const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("pasteFixture", {
  copy: () => ipcRenderer.invoke("paste-fixture:copy"),
});

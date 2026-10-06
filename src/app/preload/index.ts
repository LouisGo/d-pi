import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../contracts/desktop-bridge";
import { createAttachmentBridge } from "./bridges/attachments";
import { createAttentionBridge } from "./bridges/attention";
import { createConfigurationBridge } from "./bridges/configuration";
import { createDiagnosticBridge } from "./bridges/diagnostics";
import { createDraftBridge } from "./bridges/draft";
import { createExecutionBridge } from "./bridges/execution";
import { createLocaleBridge } from "./bridges/locale";
import { createProjectReadBridge } from "./bridges/project-reads";

const bridge: DesktopBridge = {
  ...createAttentionBridge(ipcRenderer),
  ...createDiagnosticBridge(ipcRenderer),
  ...createAttachmentBridge(ipcRenderer),
  ...createConfigurationBridge(ipcRenderer),
  ...createLocaleBridge(ipcRenderer),
  ...createProjectReadBridge(ipcRenderer),
  ...createExecutionBridge(ipcRenderer),
  ...createDraftBridge(ipcRenderer),
};
contextBridge.exposeInMainWorld("desktop", bridge);

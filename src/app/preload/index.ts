import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../contracts/desktop-bridge";
import { createConfigurationBridge } from "./bridges/configuration";
import { createDraftBridge } from "./bridges/draft";
import { createExecutionBridge } from "./bridges/execution";
import { createLocaleBridge } from "./bridges/locale";
import { createProjectReadBridge } from "./bridges/project-reads";

const bridge: DesktopBridge = {
  ...createConfigurationBridge(ipcRenderer),
  ...createLocaleBridge(ipcRenderer),
  ...createProjectReadBridge(ipcRenderer),
  ...createExecutionBridge(ipcRenderer),
  ...createDraftBridge(ipcRenderer),
};
contextBridge.exposeInMainWorld("desktop", bridge);

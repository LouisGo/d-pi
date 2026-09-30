import type {
  IpcMain,
  IpcMainEvent,
  IpcMainInvokeEvent,
  MessageChannelMain,
} from "electron";
import type { RuntimeFailure } from "../../../modules/execution/contracts/public";
import type { RuntimeService } from "../../../modules/execution/main/public";
import type { Diagnostics } from "../../../platform/main/diagnostics/public";
import type { AppStorage } from "../wiring/app-storage";

export type IpcEvent = IpcMainEvent | IpcMainInvokeEvent;

export type IpcSourceContext = {
  ipcMain: IpcMain;
  sourceValid: (event: IpcEvent) => boolean;
};

export type RuntimeConnectionContext = IpcSourceContext & {
  getRuntime: (threadId: string) => RuntimeService | undefined;
  getStore: () => AppStorage | undefined;
  createMessageChannel: () => MessageChannelMain;
};

export type RuntimeRequestContext = IpcSourceContext & {
  getRuntime: (threadId: string) => RuntimeService | undefined;
  initializeStorage: () => void;
  getDiagnostics: () => Diagnostics | undefined;
  runtimeFailure: (traceId: string, error: unknown) => RuntimeFailure;
};

export type SubmissionContext = IpcSourceContext & {
  getRuntime: (threadId: string) => RuntimeService | undefined;
};

export type ProjectReadContext = Omit<IpcSourceContext, "ipcMain"> & {
  ipcMain: Pick<IpcMain, "handle">;
  getStore: () => AppStorage | undefined;
  getDiagnostics: () =>
    | Pick<Diagnostics, "processInstanceId" | "record">
    | undefined;
  nativeSessionsPath: () => string;
};

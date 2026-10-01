import { createContext } from "react";
import type { WorkbenchProps } from "../app-layout";

export const EditorAdapterContext =
  createContext<WorkbenchProps["editor"]>(undefined);

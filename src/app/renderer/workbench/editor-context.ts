import { createContext } from "react";
import type { WorkbenchProps } from "./types";

export const EditorAdapterContext =
  createContext<WorkbenchProps["editor"]>(undefined);

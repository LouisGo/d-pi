import { createContext } from "react";
// Visibility suspends DOM scroll recording; ThreadModel still owns positions.
export const ConversationVisibilityContext = createContext(true);

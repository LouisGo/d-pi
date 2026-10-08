import { createContext } from "react";
// Shell visibility controls presentation only; Thread retains reading/resources.
export const ConversationVisibilityContext = createContext<{
  visible: boolean;
  reveal: () => void;
  openProviders?: () => void;
}>({
  visible: true,
  reveal: () => {},
});

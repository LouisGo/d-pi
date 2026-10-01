import { z } from "zod";

export const readingSearch = z.object({
  view: z
    .enum(["conversation", "files", "submissions", "history"])
    .catch("conversation")
    .default("conversation"),
});
export type ReadingView = z.infer<typeof readingSearch>["view"];

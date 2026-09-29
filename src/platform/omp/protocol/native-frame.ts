import { z } from "zod";
// Fixed OMP JSON event envelope, independent of transport framing.
export const NativeFrameSchema = z.looseObject({ type: z.string().min(1) });
export type NativeFrame = z.infer<typeof NativeFrameSchema>;

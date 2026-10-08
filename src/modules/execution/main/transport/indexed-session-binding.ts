import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative } from "node:path";
import { z } from "zod";
import type { NativeSessionBinding } from "../../../threads/contracts/public";
import { NativeRecoveryFailure } from "../../core/runtime/native-recovery-failure";

const HeaderSchema = z.object({
  type: z.literal("session"),
  version: z.literal(3),
  id: z.string(),
  cwd: z.string(),
});

export async function indexedSessionDirectory(
  configured: string | null | undefined,
  binding: NativeSessionBinding | null,
  directory: string,
): Promise<string> {
  try {
    if (
      !configured ||
      !binding ||
      binding.origin !== "cli" ||
      !binding.historyRoot
    )
      throw Error();
    const root = await realpath(configured);
    const path = await realpath(binding.sessionFile);
    const within = relative(root, path);
    if (
      root !== binding.historyRoot ||
      path !== binding.sessionFile ||
      !within ||
      isAbsolute(within) ||
      within.startsWith("..") ||
      !(await lstat(binding.sessionFile)).isFile()
    )
      throw Error();
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const prefix = Buffer.alloc(65536);
      const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
      const lines = prefix.subarray(0, bytesRead).toString("utf8").split("\n");
      const first: unknown = JSON.parse(lines[0] ?? "");
      const title = z
        .object({
          type: z.literal("title"),
          v: z.literal(1),
          title: z.string(),
          updatedAt: z.string(),
          pad: z.string(),
          source: z.enum(["auto", "user"]).optional(),
        })
        .safeParse(first).success;
      const header = HeaderSchema.parse(
        title ? JSON.parse(lines[1] ?? "") : first,
      );
      if (
        header.id !== binding.sessionId ||
        (await realpath(header.cwd)) !== directory
      )
        throw Error();
    } finally {
      await handle.close();
    }
    return dirname(path);
  } catch {
    throw new NativeRecoveryFailure("binding-changed");
  }
}

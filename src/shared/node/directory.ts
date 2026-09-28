import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import type { DirectoryIdentity } from "../../features/threads/contracts";
export async function identifyDirectory(
  directory: string,
): Promise<DirectoryIdentity> {
  const canonical = await realpath(directory);
  const info = await stat(canonical, { bigint: true });
  if (!info.isDirectory()) throw new Error("Project is not a directory");
  await access(canonical, constants.R_OK);
  return {
    directory: canonical,
    device: info.dev.toString(),
    inode: info.ino.toString(),
  };
}

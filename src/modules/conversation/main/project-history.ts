import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { z } from "zod";
import type {
  HistoryCursor,
  HistoryPage,
  ProjectHistoryCatalog,
} from "../contracts/history";
import { readNativeHistory } from "./native-history";

const headerSchema = z.object({
  type: z.literal("session"),
  version: z.literal(3),
  id: z.string(),
  cwd: z.string(),
});
const titleSchema = z.object({
  type: z.literal("title"),
  title: z.string().optional(),
  text: z.string().optional(),
});
type Located = {
  key: string;
  sessionId: string;
  title: string;
  modifiedAt: number;
  path: string;
};
async function discover(root: string, directory: string) {
  const base = await realpath(root);
  const project = await realpath(directory);
  const located: Located[] = [];
  let partial = false;
  const folders = await readdir(base, { withFileTypes: true });
  let scanned = 0;
  for (const folder of folders.slice(0, 256)) {
    if (!folder.isDirectory() || folder.isSymbolicLink()) continue;
    const files = await readdir(join(base, folder.name), {
      withFileTypes: true,
    }).catch(() => {
      partial = true;
      return [];
    });
    for (const entry of files) {
      if (
        !entry.isFile() ||
        entry.isSymbolicLink() ||
        !entry.name.endsWith(".jsonl")
      )
        continue;
      if (++scanned > 4096) {
        partial = true;
        break;
      }
      const candidate = join(base, folder.name, entry.name);
      let file;
      try {
        const path = await realpath(candidate);
        const within = relative(base, path);
        if (
          within.startsWith("..") ||
          isAbsolute(within) ||
          path !== candidate
        ) {
          partial = true;
          continue;
        }
        file = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
        const info = await file.stat();
        if (!info.isFile()) {
          partial = true;
          continue;
        }
        const bytes = Buffer.alloc(Math.min(info.size, 65536));
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
        const lines = bytes.subarray(0, bytesRead).toString("utf8").split("\n");
        const first: unknown = JSON.parse(lines[0] ?? "");
        const title = titleSchema.safeParse(first);
        const header = headerSchema.safeParse(
          title.success ? JSON.parse(lines[1] ?? "") : first,
        );
        if (!header.success) {
          partial = true;
          continue;
        }
        if ((await realpath(header.data.cwd)) !== project) continue;
        located.push({
          key: createHash("sha256")
            .update(`${project}:${within}:${header.data.id}`)
            .digest("hex"),
          sessionId: header.data.id,
          title: title.success
            ? (title.data.title || title.data.text || entry.name).slice(0, 256)
            : entry.name,
          modifiedAt: info.mtimeMs,
          path,
        });
      } catch {
        partial = true;
      } finally {
        await file?.close();
      }
    }
    if (scanned > 4096) break;
  }
  if (folders.length > 256) partial = true;
  return {
    located: located.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, 200),
    partial: partial || located.length > 200,
  };
}
function unavailable(
  error: unknown,
): Extract<ProjectHistoryCatalog, { kind: "unavailable" }> {
  const code = z.object({ code: z.string() }).safeParse(error);
  return {
    kind: "unavailable",
    reason:
      code.success && code.data.code === "ENOENT"
        ? "missing"
        : code.success && ["EACCES", "EPERM", "ELOOP"].includes(code.data.code)
          ? "denied"
          : "invalid",
  };
}
export async function listProjectNativeHistory(
  root: string,
  directory: string,
): Promise<ProjectHistoryCatalog> {
  try {
    const { located, partial } = await discover(root, directory);
    return {
      kind: "catalog",
      sessions: located.map(({ path: _path, ...entry }) => entry),
      partial,
    };
  } catch (error) {
    return unavailable(error);
  }
}
export async function readProjectNativeHistory(
  root: string,
  directory: string,
  threadId: string,
  key: string,
  cursor: HistoryCursor | null,
): Promise<HistoryPage> {
  try {
    const session = (await discover(root, directory)).located.find(
      (entry) => entry.key === key,
    );
    if (!session) return { kind: "unavailable", reason: "missing" };
    return readNativeHistory(
      root,
      {
        threadId,
        sessionId: session.sessionId,
        sessionFile: session.path,
        configContextId: key,
      },
      cursor,
      undefined,
      directory,
    );
  } catch (error) {
    return unavailable(error);
  }
}

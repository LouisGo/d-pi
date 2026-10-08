import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
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
  id: z.string().min(1),
  cwd: z.string().min(1),
});
const titleSchema = z.object({
  type: z.literal("title"),
  title: z.string().optional(),
  text: z.string().optional(),
});
export type NativeSessionMetadata = {
  key: string;
  sessionId: string;
  title: string;
  modifiedAt: number;
  path: string;
  directory: string;
  historyRoot: string;
};
async function discover(root: string, directory?: string) {
  const base = await realpath(root);
  const project = directory ? await realpath(directory) : null;
  const located: NativeSessionMetadata[] = [];
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
        const cwd = await realpath(header.data.cwd);
        if (project && cwd !== project) continue;
        const current = await stat(candidate);
        if (
          (await realpath(candidate)) !== path ||
          current.dev !== info.dev ||
          current.ino !== info.ino
        ) {
          partial = true;
          continue;
        }
        located.push({
          key: createHash("sha256")
            .update(`${cwd}:${within}:${header.data.id}`)
            .digest("hex"),
          sessionId: header.data.id,
          title: title.success
            ? (title.data.title || title.data.text || entry.name).slice(0, 256)
            : entry.name,
          modifiedAt: info.mtimeMs,
          path,
          directory: cwd,
          historyRoot: base,
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
      sessions: located.map(
        ({
          path: _path,
          directory: _directory,
          historyRoot: _root,
          ...entry
        }) => entry,
      ),
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

export async function listNativeSessionCatalog(
  root: string,
): Promise<
  | { kind: "catalog"; sessions: NativeSessionMetadata[]; partial: boolean }
  | Extract<ProjectHistoryCatalog, { kind: "unavailable" }>
> {
  try {
    const { located, partial } = await discover(root);
    return { kind: "catalog", sessions: located, partial };
  } catch (error) {
    return unavailable(error);
  }
}

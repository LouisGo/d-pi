import type { QueryClient } from "@tanstack/react-query";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { ThreadContext } from "../../threads/contracts/public";
import type { FileBridge, FileReply, FileRequest } from "../contracts/public";

// These identities come from the application's active Thread, rather than
// the bridge object or the component mounting the query.
export const fileKeys = {
  all: (resource: ThreadContext) =>
    [
      "files",
      resource.threadId,
      resource.workingDirectoryId,
      resource.directory,
    ] as const,
  listing: (resource: ThreadContext, path: string) =>
    [...fileKeys.all(resource), "list", path] as const,
  content: (resource: ThreadContext, path: string | null) =>
    [...fileKeys.all(resource), "read", path] as const,
};

/** Renderer evidence of a failed sample; IPC may not preserve its root cause. */
export class FileReadError extends Error {
  readonly traceId: string;
  readonly operation: "files:list" | "files:read";
  readonly attribution = "unknown";
  readonly reply: FileReply | undefined;

  constructor(
    readonly request: FileRequest,
    observation: { reply: FileReply } | { cause: unknown },
  ) {
    super(
      `files:${request.kind} sampling failed`,
      "cause" in observation ? { cause: observation.cause } : undefined,
    );
    this.name = "FileReadError";
    this.traceId = request.traceId;
    this.operation = request.kind === "list" ? "files:list" : "files:read";
    this.reply = "reply" in observation ? observation.reply : undefined;
  }
}

async function sample(
  files: FileBridge,
  request: FileRequest,
): Promise<FileReply> {
  let reply: FileReply;
  try {
    reply = await files.request(request);
  } catch (cause) {
    throw new FileReadError(request, { cause });
  }
  if (reply.kind === "unavailable" && reply.reason === "failed")
    throw new FileReadError(request, { reply });
  // Business conclusions stay data and never enter Query's retry policy.
  return reply;
}

export function listDirectory(
  files: FileBridge,
  resource: ThreadContext,
  path: string,
) {
  return sample(files, {
    kind: "list",
    traceId: crypto.randomUUID(),
    threadId: resource.threadId,
    path,
  });
}

export function readFile(
  files: FileBridge,
  resource: ThreadContext,
  path: string,
) {
  return sample(files, {
    kind: "read",
    traceId: crypto.randomUUID(),
    threadId: resource.threadId,
    path,
  });
}

export function refreshFiles(
  client: QueryClient,
  resource: ThreadContext,
): void {
  void client.invalidateQueries({ queryKey: fileKeys.all(resource) });
}

// Local reads must run even when Query reports the renderer offline.
const localRead = { networkMode: "always" } as const;

export const fileQueryOptions = {
  listing(files: FileBridge, resource: ThreadContext, path: string) {
    return queryOptions({
      queryKey: fileKeys.listing(resource, path),
      queryFn: () => listDirectory(files, resource, path),
      ...localRead,
    });
  },
  content(
    files: FileBridge,
    resource: ThreadContext,
    path: string | undefined,
  ) {
    return queryOptions({
      queryKey: fileKeys.content(resource, path ?? null),
      // enabled only gates automatic observation. fetchQuery/refetch can
      // still call this function, so absence must also be handled here.
      queryFn: () =>
        path === undefined
          ? Promise.resolve(null)
          : readFile(files, resource, path),
      enabled: path !== undefined,
      ...localRead,
    });
  },
} as const;

export function useDirectoryListing({
  files,
  resource,
  path,
}: {
  files: FileBridge;
  resource: ThreadContext;
  path: string;
}) {
  return useQuery(fileQueryOptions.listing(files, resource, path));
}

export function useFileContent({
  files,
  resource,
  path,
}: {
  files: FileBridge;
  resource: ThreadContext;
  path: string | undefined;
}) {
  return useQuery(fileQueryOptions.content(files, resource, path));
}

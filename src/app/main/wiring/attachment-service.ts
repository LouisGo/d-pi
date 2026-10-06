import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  listProjectFiles,
  ProjectReferenceSearch,
  readProjectBytes,
} from "../../../modules/files/main/public";
import { AttachmentStore } from "../../../modules/input/main/public";
import type {
  AttachmentReply,
  AttachmentRequest,
} from "../../contracts/attachments";
import type { AppStorage } from "./app-storage";
import { createAttachmentReferences } from "./attachment-service-references";
import { convertPdfContent } from "./pdf-content";
export function createAttachmentService(
  storage: AppStorage,
  dataDirectory: string,
  resources: string,
  validateImage: (bytes: Uint8Array) => boolean,
  chooseFiles: (threadId: string) => Promise<string[] | null>,
) {
  const searches = new ProjectReferenceSearch();
  const store = new AttachmentStore({
    directory: join(dataDirectory, "content"),
    database: storage.database,
    lifecycle: createAttachmentReferences(storage, (threadId, id) =>
      store.referenceSource(threadId, id),
    ),
    validateImage,
    convertPdf: (bytes) => convertPdfContent(resources, bytes),
    readReference: async (threadId, path, kind) => {
      const thread = storage.threads.threadContext(threadId);
      const rootBefore = await lstat(thread.directory);
      if (
        !rootBefore.isDirectory() ||
        (await realpath(thread.directory)) !== thread.directory
      )
        throw Error("reference-denied");
      const reply =
        kind === "directory"
          ? await listProjectFiles(thread.directory, path)
          : await readProjectBytes(thread.directory, path, 25 * 1024 * 1024);
      const rootAfter = await lstat(thread.directory);
      if (
        !rootAfter.isDirectory() ||
        (await realpath(thread.directory)) !== thread.directory
      )
        throw Error("reference-denied");
      if (
        rootAfter.dev !== rootBefore.dev ||
        rootAfter.ino !== rootBefore.ino ||
        rootAfter.ctimeMs !== rootBefore.ctimeMs
      )
        throw Error("reference-unavailable");
      const current = storage.threads.threadContext(threadId);
      if (
        current.directory !== thread.directory ||
        current.workingDirectoryId !== thread.workingDirectoryId
      )
        throw Error("reference-denied");
      if (kind === "directory" && reply.kind === "entries") {
        if (reply.truncated) throw Error("source-too-large");
        // Freeze direct entry names and kinds, never recursively inline file bodies.
        // JSON escaping keeps control characters and delimiter-shaped names literal.
        const bytes = new TextEncoder().encode(
          JSON.stringify({
            schemaVersion: 1,
            path,
            entries: reply.entries.map(({ name, kind }) => ({ name, kind })),
          }),
        );
        return {
          bytes,
          version: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        };
      }
      if (reply.kind !== "bytes")
        throw Error(
          reply.kind === "unavailable" && reply.reason === "denied"
            ? "reference-denied"
            : "reference-unavailable",
        );
      return { bytes: reply.bytes, version: reply.version };
    },
  });
  async function execute(command: AttachmentRequest): Promise<AttachmentReply> {
    if (stopping) throw Error("Attachment storage closed");
    const thread = storage.threads.threadContext(command.threadId);
    const attachments = (items: Awaited<ReturnType<typeof store.list>>) =>
      ({ kind: "attachments", items }) as const;
    switch (command.kind) {
      case "check-storage":
        return store
          .checkStorage(command.threadId)
          .catch(
            () =>
              ({ kind: "unavailable", reason: "storage-unavailable" }) as const,
          );
      case "clean-storage":
        return store
          .cleanStorage(command.threadId)
          .catch(
            () =>
              ({ kind: "unavailable", reason: "storage-unavailable" }) as const,
          );
      case "list":
        return attachments(await store.list(command.threadId));
      case "import-bytes": {
        const bytes = Buffer.from(command.dataBase64, "base64");
        if (bytes.toString("base64") !== command.dataBase64)
          return { kind: "unavailable", reason: "content-corrupt" };
        return attachments([
          await store.importBytes(command.threadId, {
            name: command.name,
            mimeType: command.mimeType,
            bytes,
            source: command.source,
          }),
        ]);
      }
      case "choose-import": {
        const paths = await chooseFiles(command.threadId);
        if (!paths) return { kind: "cancelled" };
        const current = storage.threads.threadContext(command.threadId);
        if (
          current.directory !== thread.directory ||
          current.workingDirectoryId !== thread.workingDirectoryId
        )
          throw Error("Foreign attachment Thread");
        const items = [];
        for (const path of paths) {
          const handle = await open(
            path,
            constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
          );
          try {
            const before = await handle.stat();
            if (!before.isFile()) throw Error("reference-unavailable");
            if (before.size > 25 * 1024 * 1024)
              return { kind: "unavailable", reason: "source-too-large" };
            const bytes = await handle.readFile();
            const after = await handle.stat();
            if (
              before.size !== after.size ||
              before.mtimeMs !== after.mtimeMs ||
              before.ctimeMs !== after.ctimeMs
            )
              throw Error("reference-unavailable");
            items.push(
              await store.importBytes(command.threadId, {
                name: basename(path),
                mimeType: "",
                bytes,
                source: "file",
              }),
            );
          } finally {
            await handle.close();
          }
        }
        return attachments(items);
      }
      case "add-reference":
        return attachments([
          await store.addReference(
            command.threadId,
            command.path,
            command.referenceKind,
          ),
        ]);
      case "preview":
        return store.preview(command.threadId, command.id);
      case "retry": {
        const item = await store.retry(command.threadId, command.id);
        return item
          ? attachments([item])
          : { kind: "unavailable", reason: "attachment-not-found" };
      }
      case "set-text-only": {
        const item = await store.setTextOnly(
          command.threadId,
          command.id,
          command.value,
        );
        return item
          ? attachments([item])
          : { kind: "unavailable", reason: "attachment-not-found" };
      }
      case "search-reference": {
        if (command.refresh) searches.invalidate(thread.directory);
        const result = await searches.search(thread.directory, command.query);
        const current = storage.threads.threadContext(command.threadId);
        if (
          current.directory !== thread.directory ||
          current.workingDirectoryId !== thread.workingDirectoryId
        )
          return { kind: "unavailable", reason: "reference-denied" };
        return result;
      }
    }
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopping: Promise<void> | undefined;
  function startMaintenance(onFailure?: () => void): void {
    if (timer || stopping) return;
    let collecting = false;
    const collect = () => {
      if (collecting) return;
      collecting = true;
      void store
        .collectGarbage()
        .then((report) => {
          if (
            report.issues.some((item) => item.reason === "storage-unavailable")
          )
            onFailure?.();
        })
        .catch(() => {
          onFailure?.();
        })
        .finally(() => {
          collecting = false;
        });
    };
    collect();
    timer = setInterval(collect, 60000);
    timer.unref();
  }
  function close(): Promise<void> {
    if (stopping) return stopping;
    if (timer) clearInterval(timer);
    timer = undefined;
    stopping = Promise.all([store.close(), searches.close()]).then(() => {});
    return stopping;
  }
  return { store, execute, startMaintenance, close };
}
export type AttachmentService = ReturnType<typeof createAttachmentService>;

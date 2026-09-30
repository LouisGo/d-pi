import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import type {
  FileBridge,
  FileReply,
} from "../../../modules/files/contracts/public";
import { fileQueryOptions } from "../../../modules/files/renderer/public";
import { ThreadContextSchema } from "../../../modules/workspace/contracts/public";
import { readInFlight } from "./refresh-state";

const resource = ThreadContextSchema.parse({
  threadId: crypto.randomUUID(),
  workspaceId: crypto.randomUUID(),
  directory: "/fixture",
});

it("counts a first sample as in flight", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let release: (reply: FileReply) => void = () => {};
  const bridge: FileBridge = {
    request: () => new Promise<FileReply>((accept) => (release = accept)),
  };
  const observer = new QueryObserver(
    client,
    fileQueryOptions.listing(bridge, resource, ""),
  );
  const unsubscribe = observer.subscribe(() => {});
  const pending = observer.getCurrentResult();
  expect(readInFlight(pending)).toBe(true);
  release({
    kind: "entries",
    path: "",
    entries: [],
    truncated: false,
  });
  await observer.refetch();
  expect(readInFlight(observer.getCurrentResult())).toBe(false);
  unsubscribe();
  client.clear();
});

it("does not count a disabled query as in flight", () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const bridge: FileBridge = {
    request: () => Promise.resolve({} as FileReply),
  };
  const observer = new QueryObserver(
    client,
    fileQueryOptions.content(bridge, resource, undefined),
  );
  const unsubscribe = observer.subscribe(() => {});
  const result = observer.getCurrentResult();
  // Query keeps a disabled query pending forever; that must not read as work.
  expect(result.isPending).toBe(true);
  expect(result.isEnabled).toBe(false);
  expect(readInFlight(result)).toBe(false);
  unsubscribe();
  client.clear();
});

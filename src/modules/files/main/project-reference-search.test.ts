import * as fs from "node:fs/promises";
import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, expect, test, vi } from "vitest";
import { ProjectReferenceEntrySchema } from "../contracts/public";
import { listProjectFiles } from "./project-files";
import { ProjectReferenceSearch } from "./project-reference-search";

vi.mock("node:fs/promises", { spy: true });

const roots: string[] = [];
const searches: ProjectReferenceSearch[] = [];
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "d-pi-reference-search-")),
  );
  roots.push(root);
  return root;
}
function search(
  options?: ConstructorParameters<typeof ProjectReferenceSearch>[0],
) {
  const value = new ProjectReferenceSearch(options);
  searches.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(searches.splice(0).map((value) => value.close()));
  vi.restoreAllMocks();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("directory basename wins over more than one hundred matching descendant files, preserving @", async () => {
  const root = await fixture();
  await mkdir(join(root, "src", "@virtualList"), { recursive: true });
  await Promise.all(
    Array.from({ length: 180 }, (_, id) =>
      writeFile(join(root, "src", "@virtualList", `${id}.ts`), ""),
    ),
  );
  const result = await search().search(root, "@virtualList");
  expect(result.entries[0]).toEqual({
    path: "src/@virtualList",
    name: "@virtualList",
    kind: "directory",
  });
  expect(result.entries).toHaveLength(100);
  expect(result.entries.slice(1).every((entry) => entry.kind === "file")).toBe(
    true,
  );
  expect(result.truncated).toBe(true);
});

test("warm queries perform no directory I/O and concurrent first searches share one build", async () => {
  const root = await fixture();
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "main.ts"), "");
  const opening = vi.spyOn(fs, "opendir");
  const index = search();
  const results = await Promise.all([
    index.search(root, "main"),
    index.search(root, "src"),
    index.search(root, "main.ts"),
  ]);
  expect(results[0]?.entries[0]?.path).toBe("src/main.ts");
  expect(opening).toHaveBeenCalledTimes(2);
  await index.search(root, "missing");
  await index.search(root, "main");
  expect(opening).toHaveBeenCalledTimes(2);
});

test("TTL refresh observes added and removed files, while projects remain isolated", async () => {
  const root = await fixture();
  const other = await fixture();
  await writeFile(join(root, "old.ts"), "");
  await writeFile(join(other, "other.ts"), "");
  const clock = vi.spyOn(performance, "now").mockReturnValue(1000);
  const index = search({ ttlMs: 100 });
  expect((await index.search(root, "")).entries[0]?.name).toBe("old.ts");
  await rm(join(root, "old.ts"));
  await writeFile(join(root, "new.ts"), "");
  expect((await index.search(root, "")).entries[0]?.name).toBe("old.ts");
  clock.mockReturnValue(1101);
  expect((await index.search(root, "")).entries[0]?.name).toBe("new.ts");
  expect((await index.search(other, "")).entries[0]?.name).toBe("other.ts");
});

test("bounded index reports coverage loss and LRU eviction rebuilds only the evicted project", async () => {
  const roots = await Promise.all([fixture(), fixture(), fixture()]);
  await Promise.all(
    roots.map(async (root) => {
      await Promise.all(
        Array.from({ length: 6 }, (_, id) =>
          writeFile(join(root, `${id}.ts`), ""),
        ),
      );
    }),
  );
  const index = search({ maxEntries: 4, maxProjects: 2 });
  const opening = vi.spyOn(fs, "opendir");
  for (const root of roots) {
    const result = await index.search(root, "");
    expect(result.entries).toHaveLength(4);
    expect(result.truncated).toBe(true);
  }
  expect(opening).toHaveBeenCalledTimes(3);
  await index.search(roots[2] ?? "", "");
  expect(opening).toHaveBeenCalledTimes(3);
  await index.search(roots[0] ?? "", "");
  expect(opening).toHaveBeenCalledTimes(4);
});

test("symlink entries and symlink directories are excluded, missing root rejects, close drains", async () => {
  const root = await fixture();
  const outside = await fixture();
  await writeFile(join(outside, "secret.ts"), "secret");
  await symlink(outside, join(root, "escape"));
  await symlink(join(outside, "secret.ts"), join(root, "file-link"));
  const index = search();
  const result = await index.search(root, "");
  expect(result).toEqual({ kind: "search", entries: [], truncated: false });
  await expect(index.search(join(root, "missing"), "")).rejects.toThrow();
  const cold = index.search(outside, "secret");
  const closed = index.close();
  await cold;
  await closed;
  await index.close();
  await expect(index.search(root, "")).rejects.toThrow("closed");
});

test("public entry distinguishes directories and files with strict size bounds", () => {
  expect(
    ProjectReferenceEntrySchema.safeParse({
      path: "src",
      name: "src",
      kind: "directory",
    }).success,
  ).toBe(true);
  expect(
    ProjectReferenceEntrySchema.safeParse({
      path: "src",
      name: "src",
      kind: "symlink",
    }).success,
  ).toBe(false);
  expect(
    ProjectReferenceEntrySchema.safeParse({
      path: "src",
      name: "x".repeat(513),
      kind: "file",
    }).success,
  ).toBe(false);
  expect(
    ProjectReferenceEntrySchema.safeParse({
      path: "x".repeat(4097),
      name: "x",
      kind: "file",
    }).success,
  ).toBe(false);
  expect(
    ProjectReferenceEntrySchema.safeParse({
      path: "src",
      name: "src",
      kind: "file",
      extra: true,
    }).success,
  ).toBe(false);
});

test("explicit invalidation refreshes immediately and invalidation during a build cannot republish stale cache", async () => {
  const root = await fixture();
  await writeFile(join(root, "before.ts"), "");
  const index = search();
  await index.search(root, "");
  await writeFile(join(root, "after.ts"), "");
  index.invalidate(root);
  expect((await index.search(root, "after")).entries[0]?.name).toBe("after.ts");
  const opening = vi.mocked(fs.opendir);
  const actualOpen = (await vi.importActual<typeof fs>("node:fs/promises"))
    .opendir;
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: (() => void) | undefined;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  opening.mockImplementationOnce(async (...args) => {
    const directory = await actualOpen(...args);
    started?.();
    await blocked;
    return directory;
  });
  index.invalidate(root);
  const pending = index.search(root, "");
  await entered;
  index.invalidate(root);
  const fresh = index.search(root, "");
  release?.();
  const [a, b] = await Promise.all([pending, fresh]);
  expect(a).toEqual(b);
  const calls = opening.mock.calls.length;
  await index.search(root, "after");
  expect(opening.mock.calls.length).toBe(calls);
  expect(calls).toBeGreaterThanOrEqual(4);
});

test("a directory replaced during sampling never publishes its unverified batch", async () => {
  const root = await fixture();
  const outside = await fixture();
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "inside.ts"), "");
  await writeFile(join(outside, "secret.ts"), "");
  const actualOpen = (await vi.importActual<typeof fs>("node:fs/promises"))
    .opendir;
  vi.mocked(fs.opendir)
    .mockImplementationOnce(actualOpen)
    .mockImplementationOnce(async (...args) => {
      const directory = await actualOpen(...args);
      const read = directory.read.bind(directory);
      vi.spyOn(directory, "read").mockImplementationOnce(async () => {
        const item = await read();
        await rename(join(root, "src"), join(root, "moved"));
        await symlink(outside, join(root, "src"));
        return item;
      });
      return directory;
    });
  const result = await search().search(root, "");
  expect(result.truncated).toBe(true);
  expect(result.entries.map((entry) => entry.path)).toEqual(["src"]);
});

test("character budget omits oversized candidates with explicit partial coverage", async () => {
  const root = await fixture();
  await writeFile(join(root, "an-entry-too-long-for-budget.ts"), "");
  expect(await search({ maxCharacters: 10 }).search(root, "")).toEqual({
    kind: "search",
    entries: [],
    truncated: true,
  });
});

test("root replaced by another directory at the same canonical path cannot mix project snapshots", async () => {
  const parent = await fixture();
  const root = join(parent, "project");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "old.ts"), "");
  const actualOpen = (await vi.importActual<typeof fs>("node:fs/promises"))
    .opendir;
  vi.mocked(fs.opendir)
    .mockImplementationOnce(actualOpen)
    .mockImplementationOnce(async (...args) => {
      await rename(root, join(parent, "old-project"));
      await mkdir(join(root, "src"), { recursive: true });
      await writeFile(join(root, "src", "new.ts"), "");
      return actualOpen(...args);
    });
  await expect(search().search(root, "")).rejects.toThrow("root changed");
});

test("concurrent project builds cannot grow beyond bounded cache slots, and close drains every open handle", async () => {
  const roots = await Promise.all([fixture(), fixture(), fixture()]);
  const actualOpen = (await vi.importActual<typeof fs>("node:fs/promises"))
    .opendir;
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered = 0;
  let started: (() => void) | undefined;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const closing: ReturnType<typeof vi.fn>[] = [];
  vi.mocked(fs.opendir).mockImplementation(async (...args) => {
    const directory = await actualOpen(...args);
    closing.push(vi.spyOn(directory, "close"));
    entered += 1;
    if (entered === 2) started?.();
    await blocked;
    return directory;
  });
  const index = search({ maxProjects: 2 });
  const a = index.search(roots[0] ?? "", "");
  const b = index.search(roots[1] ?? "", "");
  await ready;
  await expect(index.search(roots[2] ?? "", "")).rejects.toThrow("busy");
  const drain = index.close();
  expect(index.close()).toBe(drain);
  release?.();
  await Promise.all([a, b, drain]);
  expect(closing).toHaveLength(2);
  expect(closing.every((close) => close.mock.calls.length === 1)).toBe(true);
});

test.runIf(process.env.D_PI_REFERENCE_BENCH === "1")(
  "measures real large-project cold and warm I/O",
  async () => {
    const root = await fixture();
    await mkdir(join(root, "@virtualList"));
    const count = 20_000;
    for (let start = 0; start < count; start += 100) {
      await Promise.all(
        Array.from({ length: Math.min(100, count - start) }, (_, offset) =>
          writeFile(join(root, "@virtualList", `${start + offset}.ts`), ""),
        ),
      );
    }
    // Exact old attachment-service.ts search loop at base b290b36, invoking
    // the unchanged real listProjectFiles (full readdir, first 500 lstat).
    const legacy = async (query: string) => {
      const stack = [""];
      const paths: string[] = [];
      let visited = 0;
      let limited = false;
      while (stack.length && visited < 5000 && paths.length < 100) {
        const path = stack.pop();
        if (path === undefined) break;
        const reply = await listProjectFiles(root, path);
        if (reply.kind !== "entries") {
          limited = true;
          continue;
        }
        limited ||= reply.truncated;
        for (const entry of reply.entries) {
          visited += 1;
          if (visited > 5000) {
            limited = true;
            break;
          }
          if (entry.kind === "directory" && entry.name !== "node_modules")
            stack.push(entry.path);
          else if (
            entry.kind === "file" &&
            entry.path.toLocaleLowerCase().includes(query.toLocaleLowerCase())
          ) {
            paths.push(entry.path);
            if (paths.length === 100) break;
          }
        }
      }
      return {
        paths,
        truncated: limited || stack.length > 0 || paths.length === 100,
      };
    };
    const beforeCounters = {
      readdir: vi.mocked(fs.readdir).mock.calls.length,
      lstat: vi.mocked(fs.lstat).mock.calls.length,
      realpath: vi.mocked(fs.realpath).mock.calls.length,
      stat: vi.mocked(fs.stat).mock.calls.length,
    };
    const beforeTimes: number[] = [];
    let legacyResult: Awaited<ReturnType<typeof legacy>> | undefined;
    for (let query = 0; query < 3; query += 1) {
      const started = performance.now();
      legacyResult = await legacy("@virtualList");
      beforeTimes.push(performance.now() - started);
    }
    const before = {
      queries: 3,
      source: "b290b36:src/app/main/wiring/attachment-service.ts:152-192",
      matches: legacyResult?.paths.length,
      firstKind: "file",
      truncated: legacyResult?.truncated,
      ms: beforeTimes,
      io: {
        readdir:
          vi.mocked(fs.readdir).mock.calls.length - beforeCounters.readdir,
        lstat: vi.mocked(fs.lstat).mock.calls.length - beforeCounters.lstat,
        realpath:
          vi.mocked(fs.realpath).mock.calls.length - beforeCounters.realpath,
        stat: vi.mocked(fs.stat).mock.calls.length - beforeCounters.stat,
      },
      coverage:
        "Two whole directories were readdir-ed each query; only first 500 sorted descendants were classified, only first 100 matching files were returned. After builds all 20,001 entries, including the directory: latency is not an equal-coverage speedup claim.",
    };
    const opening = vi.mocked(fs.opendir);
    const reading = vi.mocked(fs.lstat);
    const canonical = vi.mocked(fs.realpath);
    const actual = await vi.importActual<typeof fs>("node:fs/promises");
    let directoryReads = 0;
    let handleStats = 0;
    let directoryCloses = 0;
    let handleCloses = 0;
    opening.mockImplementation(async (...args) => {
      const directory = await actual.opendir(...args);
      const read = directory.read.bind(directory);
      const close = directory.close.bind(directory);
      vi.spyOn(directory, "read").mockImplementation(() => {
        directoryReads += 1;
        return read();
      });
      vi.spyOn(directory, "close").mockImplementation(() => {
        directoryCloses += 1;
        return close();
      });
      return directory;
    });
    vi.mocked(fs.open).mockImplementation(async (...args) => {
      const handle = await actual.open(...args);
      const stat = handle.stat.bind(handle);
      const close = handle.close.bind(handle);
      vi.spyOn(handle, "stat").mockImplementation(() => {
        handleStats += 1;
        return stat();
      });
      vi.spyOn(handle, "close").mockImplementation(() => {
        handleCloses += 1;
        return close();
      });
      return handle;
    });
    const openBase = vi.mocked(fs.open).mock.calls.length;
    const openingBase = opening.mock.calls.length;
    const readingBase = reading.mock.calls.length;
    const canonicalBase = canonical.mock.calls.length;
    const index = search();
    const began = performance.now();
    const cold = await index.search(root, "@virtualList");
    const coldMs = performance.now() - began;
    const afterCold = {
      open: vi.mocked(fs.open).mock.calls.length - openBase,
      handleStat: handleStats,
      directoryRead: directoryReads,
      directoryClose: directoryCloses,
      handleClose: handleCloses,
      opendir: opening.mock.calls.length - openingBase,
      lstat: reading.mock.calls.length - readingBase,
      realpath: canonical.mock.calls.length - canonicalBase,
    };
    const times: number[] = [];
    for (let id = 0; id < 30; id += 1) {
      const began = performance.now();
      await index.search(root, id % 2 ? "@virtualList" : "virtualList/199");
      times.push(performance.now() - began);
    }
    const warmIO = {
      open: vi.mocked(fs.open).mock.calls.length - openBase - afterCold.open,
      handleStat: handleStats - afterCold.handleStat,
      directoryRead: directoryReads - afterCold.directoryRead,
      opendir: opening.mock.calls.length - openingBase - afterCold.opendir,
      lstat: reading.mock.calls.length - readingBase - afterCold.lstat,
      realpath:
        canonical.mock.calls.length - canonicalBase - afterCold.realpath,
    };
    expect(cold.entries[0]?.kind).toBe("directory");
    expect(afterCold.opendir).toBe(2);
    expect(afterCold.lstat).toBe(5);
    expect(warmIO).toEqual({
      open: 0,
      handleStat: 0,
      directoryRead: 0,
      opendir: 0,
      lstat: 0,
      realpath: 0,
    });
    await mkdir("dist/validation/project-reference-search", {
      recursive: true,
    });
    await writeFile(
      "dist/validation/project-reference-search/benchmark.json",
      JSON.stringify(
        {
          fixtureEntries: count + 1,
          before,
          coldMs,
          coldIO: afterCold,
          warmQueries: times.length,
          warmMs: {
            min: Math.min(...times),
            max: Math.max(...times),
            mean: times.reduce((sum, time) => sum + time, 0) / times.length,
          },
          warmIO,
        },
        null,
        2,
      ),
    );
  },
  30_000,
);

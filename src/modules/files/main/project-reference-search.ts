import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { performance } from "node:perf_hooks";
import type { ProjectReferenceEntry } from "../contracts/public";

const MAX_RESULTS = 100;
const MAX_DEPTH = 64;
const MAX_BUILD_MS = 5000;
const IGNORED = new Set([".git", "node_modules"]);
interface Options {
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly maxProjects?: number;
  readonly maxCharacters?: number;
}
interface IndexedEntry {
  readonly entry: ProjectReferenceEntry;
  readonly path: string;
  readonly name: string;
}
interface Snapshot {
  readonly entries: readonly IndexedEntry[];
  readonly truncated: boolean;
  readonly builtAt: number;
}
interface Project {
  epoch: number;
  snapshot: Snapshot | undefined;
  pending: Promise<Snapshot> | undefined;
}
interface SearchReply {
  readonly kind: "search";
  readonly entries: ProjectReferenceEntry[];
  readonly truncated: boolean;
}
function bounded(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > fallback)
    throw new RangeError("Invalid project reference search limit");
  return value;
}
function rank(entry: IndexedEntry, query: string): number {
  if (entry.name === query) return entry.entry.kind === "directory" ? 0 : 2;
  if (entry.name.startsWith(query))
    return entry.entry.kind === "directory" ? 1 : 3;
  if (entry.name.includes(query)) return 4;
  return entry.path.includes(query) ? 5 : 6;
}
function compare(a: IndexedEntry, b: IndexedEntry, query: string): number {
  return (
    rank(a, query) - rank(b, query) || a.entry.path.localeCompare(b.entry.path)
  );
}

/** Main owns this bounded, disposable hint index; selecting a hint never authorizes a read. */
export class ProjectReferenceSearch {
  readonly #projects = new Map<string, Project>();
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #maxProjects: number;
  readonly #maxCharacters: number;
  #closing: Promise<void> | undefined;

  constructor(options: Options = {}) {
    this.#ttlMs = bounded(options.ttlMs, 30_000);
    this.#maxEntries = bounded(options.maxEntries, 50_000);
    this.#maxProjects = bounded(options.maxProjects, 3);
    // UTF-16 originals + lower-case matching copies are counted together.
    this.#maxCharacters = bounded(options.maxCharacters, 4 * 1024 * 1024);
  }

  invalidate(root: string): void {
    const project = this.#projects.get(root);
    if (!project) return;
    project.epoch += 1;
    project.snapshot = undefined;
  }

  async search(root: string, query: string): Promise<SearchReply> {
    if (this.#closing) throw new Error("Project reference search is closed");
    if (!isAbsolute(root) || root.includes("\0") || query.length > 4096)
      throw new Error("Invalid project reference search path or query");
    const project = this.#project(root);
    let snapshot = project.snapshot;
    if (!snapshot || performance.now() - snapshot.builtAt >= this.#ttlMs) {
      if (!project.pending) {
        project.pending = this.#refresh(root, project).finally(() => {
          project.pending = undefined;
        });
      }
      snapshot = await project.pending;
    }
    const normalized = query.trim().replaceAll("\\", "/").toLocaleLowerCase();
    const best: IndexedEntry[] = [];
    let matches = 0;
    for (const entry of snapshot.entries) {
      if (normalized && rank(entry, normalized) === 6) continue;
      matches += 1;
      // Keep only top K while examining the whole bounded snapshot. A matching
      // directory cannot disappear behind the first 100 matching descendants.
      let low = 0;
      let high = best.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        const candidate = best[middle];
        if (candidate && compare(entry, candidate, normalized) >= 0)
          low = middle + 1;
        else high = middle;
      }
      if (low < MAX_RESULTS) {
        best.splice(low, 0, entry);
        if (best.length > MAX_RESULTS) best.pop();
      }
    }
    return {
      kind: "search",
      entries: best.map(({ entry }) => ({ ...entry })),
      truncated: snapshot.truncated || matches > MAX_RESULTS,
    };
  }

  close(): Promise<void> {
    if (!this.#closing) {
      const pending = [...this.#projects.values()].flatMap((project) =>
        project.pending ? [project.pending] : [],
      );
      this.#closing = Promise.allSettled(pending).then(() => {
        this.#projects.clear();
      });
    }
    return this.#closing;
  }

  #project(root: string): Project {
    const existing = this.#projects.get(root);
    if (existing) {
      this.#projects.delete(root);
      this.#projects.set(root, existing);
      return existing;
    }
    if (this.#projects.size >= this.#maxProjects) {
      const evictable = [...this.#projects].find(
        ([, project]) => !project.pending,
      );
      if (!evictable) throw new Error("Project reference search is busy");
      this.#projects.delete(evictable[0]);
    }
    const project: Project = {
      epoch: 0,
      snapshot: undefined,
      pending: undefined,
    };
    this.#projects.set(root, project);
    return project;
  }

  async #refresh(root: string, project: Project): Promise<Snapshot> {
    while (true) {
      const epoch = project.epoch;
      const snapshot = await this.#build(root);
      // Invalidation while a build is in flight coalesces into one next build;
      // nobody can publish the old snapshot into the refreshed cache.
      if (epoch === project.epoch || this.#closing) {
        if (!this.#closing) project.snapshot = snapshot;
        return snapshot;
      }
    }
  }

  async #build(root: string): Promise<Snapshot> {
    if ((await realpath(root)) !== root)
      throw new Error("Project reference root changed");
    const queue = [{ path: "", depth: 0 }];
    const entries: IndexedEntry[] = [];
    let characters = 0;
    let visited = 0;
    let truncated = false;
    let rootIdentity: { dev: number; ino: number } | undefined;
    const started = performance.now();
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      if (
        visited >= this.#maxEntries ||
        performance.now() - started > MAX_BUILD_MS
      ) {
        truncated = true;
        break;
      }
      const current = queue[cursor];
      if (!current) break;
      const full = join(root, current.path);
      const batch: IndexedEntry[] = [];
      const children: typeof queue = [];
      try {
        // Dirent avoids one lstat per ordinary file. Only traversed directories
        // are sampled with NOFOLLOW, realpath, and identity checks.
        if ((await realpath(full)) !== full)
          throw new Error("Directory changed");
        const file = await open(
          full,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        try {
          const before = await file.stat();
          if (!before.isDirectory()) throw new Error("Not a directory");
          if (!current.path)
            rootIdentity = { dev: before.dev, ino: before.ino };
          const directory = await opendir(full, { bufferSize: 128 });
          try {
            const sampled = await lstat(full);
            if (
              !sampled.isDirectory() ||
              sampled.dev !== before.dev ||
              sampled.ino !== before.ino ||
              (await realpath(full)) !== full
            )
              throw new Error("Directory changed");
            while (
              visited < this.#maxEntries &&
              performance.now() - started <= MAX_BUILD_MS
            ) {
              const item = await directory.read();
              if (!item) break;
              visited += 1;
              if (
                IGNORED.has(item.name) ||
                item.isSymbolicLink() ||
                (!item.isFile() && !item.isDirectory())
              )
                continue;
              const path = current.path
                ? `${current.path}/${item.name}`
                : item.name;
              const cost = 2 * (path.length + item.name.length);
              if (
                item.name.length > 512 ||
                path.length > 4096 ||
                characters + cost > this.#maxCharacters
              ) {
                truncated = true;
                continue;
              }
              characters += cost;
              batch.push({
                entry: {
                  path,
                  name: item.name,
                  kind: item.isDirectory() ? "directory" : "file",
                },
                path: path.toLocaleLowerCase(),
                name: item.name.toLocaleLowerCase(),
              });
              if (item.isDirectory()) {
                if (current.depth < MAX_DEPTH)
                  children.push({ path, depth: current.depth + 1 });
                else truncated = true;
              }
            }
            if (
              visited >= this.#maxEntries ||
              performance.now() - started > MAX_BUILD_MS
            )
              truncated = true;
            const after = await file.stat();
            const pathAfter = await lstat(full);
            if (
              !pathAfter.isDirectory() ||
              after.dev !== before.dev ||
              after.ino !== before.ino ||
              pathAfter.dev !== before.dev ||
              pathAfter.ino !== before.ino ||
              after.mtimeMs !== before.mtimeMs ||
              (await realpath(full)) !== full
            )
              throw new Error("Directory changed");
          } finally {
            await directory.close();
          }
        } finally {
          await file.close();
        }
        entries.push(...batch);
        queue.push(...children);
      } catch (error) {
        if (!current.path) throw error;
        // A changing/inaccessible subtree cannot publish its unverified batch.
        truncated = true;
      }
    }
    const rootAfter = await lstat(root);
    if (
      !rootIdentity ||
      !rootAfter.isDirectory() ||
      rootAfter.dev !== rootIdentity.dev ||
      rootAfter.ino !== rootIdentity.ino ||
      (await realpath(root)) !== root
    )
      throw new Error("Project reference root changed");
    return { entries, truncated, builtAt: performance.now() };
  }
}

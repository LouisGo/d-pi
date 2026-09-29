import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, test, vi } from "vitest";
import { listGitChanges, readGitChange } from "./project-git";

const run = promisify(execFile);
const roots: string[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "d-pi-s4-git-")));
  roots.push(root);
  return root;
}
async function git(root: string, ...args: string[]) {
  return run("git", ["-C", root, ...args]);
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("reports a missing project and missing Git executable distinctly", async () => {
  const root = await fixture();
  expect(await listGitChanges(join(root, "gone"))).toMatchObject({
    kind: "unavailable",
    reason: "missing",
  });
  vi.stubEnv("PATH", "/nonexistent");
  expect(await listGitChanges(root)).toMatchObject({
    kind: "unavailable",
    reason: "git-unavailable",
  });
});

test("separates HEAD/index, index/worktree and untracked without author attribution", async () => {
  const root = await fixture();
  await git(root, "init", "-q");
  await git(root, "config", "user.name", "Fixture");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await writeFile(join(root, "mixed.txt"), "head\n");
  await git(root, "add", "mixed.txt");
  await git(root, "commit", "-qm", "init");
  await writeFile(join(root, "mixed.txt"), "index\n");
  await git(root, "add", "mixed.txt");
  await writeFile(join(root, "mixed.txt"), "worktree\n");
  await writeFile(join(root, "new.txt"), "new\n");
  const result = await listGitChanges(root);
  expect(result.kind).toBe("changes");
  if (result.kind !== "changes") return;
  expect(result.entries.map((entry) => [entry.scope, entry.path])).toEqual(
    expect.arrayContaining([
      ["head-index", "mixed.txt"],
      ["index-worktree", "mixed.txt"],
      ["untracked", "new.txt"],
    ]),
  );
  expect(JSON.stringify(result)).not.toContain("agent");
  const staged = await readGitChange(root, "head-index", "mixed.txt");
  const unstaged = await readGitChange(root, "index-worktree", "mixed.txt");
  expect(staged).toMatchObject({
    kind: "diff",
    left: { text: "head\n" },
    right: { text: "index\n" },
  });
  expect(unstaged).toMatchObject({
    kind: "diff",
    left: { text: "index\n" },
    right: { text: "worktree\n" },
  });
});

test("distinguishes non-Git and unborn HEAD", async () => {
  const root = await fixture();
  expect(await listGitChanges(root)).toMatchObject({
    kind: "unavailable",
    reason: "not-git",
  });
  await git(root, "init", "-q");
  await writeFile(join(root, "first.txt"), "first");
  await git(root, "add", "first.txt");
  const result = await listGitChanges(root);
  expect(result).toMatchObject({ kind: "changes", head: null });
  if (result.kind !== "changes") return;
  expect(result.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ scope: "head-index", path: "first.txt" }),
    ]),
  );
  expect(await readGitChange(root, "head-index", "first.txt")).toMatchObject({
    kind: "diff",
    left: { kind: "absent" },
    right: { text: "first" },
  });
});

test("labels a rename with its former path and refuses binary text diff", async () => {
  const root = await fixture();
  await git(root, "init", "-q");
  await git(root, "config", "user.name", "Fixture");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await writeFile(join(root, "old.txt"), "one\ntwo\nthree\nfour\nfive\nsix\n");
  await writeFile(join(root, "blob.bin"), Buffer.from([0, 1, 2]));
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "init");
  await git(root, "mv", "old.txt", "new.txt");
  await writeFile(join(root, "blob.bin"), Buffer.from([0, 3, 4]));
  const result = await listGitChanges(root);
  expect(result).toMatchObject({ kind: "changes" });
  if (result.kind !== "changes") return;
  expect(result.entries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        scope: "head-index",
        path: "new.txt",
        previousPath: "old.txt",
        status: "renamed",
      }),
    ]),
  );
  expect(await readGitChange(root, "head-index", "new.txt")).toMatchObject({
    kind: "diff",
    path: "new.txt",
    previousPath: "old.txt",
    left: { text: "one\ntwo\nthree\nfour\nfive\nsix\n" },
    right: { text: "one\ntwo\nthree\nfour\nfive\nsix\n" },
  });
  expect(await readGitChange(root, "index-worktree", "blob.bin")).toMatchObject(
    { kind: "unavailable", reason: "binary" },
  );
});

test("scopes a parent repository to the selected project subdirectory", async () => {
  const root = await fixture();
  const project = join(root, "package");
  await mkdir(project);
  await git(root, "init", "-q");
  await git(root, "config", "user.name", "Fixture");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await writeFile(join(root, "outside.txt"), "old");
  await writeFile(join(project, "inside.txt"), "old");
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "init");
  await writeFile(join(root, "outside.txt"), "new");
  await writeFile(join(project, "inside.txt"), "new");
  const changes = await listGitChanges(project);
  expect(changes).toMatchObject({ kind: "changes", repository: root });
  if (changes.kind !== "changes") return;
  expect(changes.entries.map(({ path }) => path)).toEqual(["inside.txt"]);
  expect(
    await readGitChange(project, "index-worktree", "inside.txt"),
  ).toMatchObject({
    kind: "diff",
    left: { text: "old" },
    right: { text: "new" },
  });
});

test("does not compare a symlink target as if it were the link's Git content", async () => {
  const root = await fixture();
  await git(root, "init", "-q");
  await git(root, "config", "user.name", "Fixture");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await writeFile(join(root, "one.txt"), "one");
  await writeFile(join(root, "two.txt"), "two");
  await symlink("one.txt", join(root, "link"));
  await git(root, "add", ".");
  await git(root, "commit", "-qm", "init");
  await rm(join(root, "link"));
  await symlink("two.txt", join(root, "link"));
  expect(await readGitChange(root, "index-worktree", "link")).toMatchObject({
    kind: "unavailable",
    reason: "unsupported",
  });
});

test("marks a diff stale when the worktree changes with the same Git status during sampling", async () => {
  const root = await fixture();
  await git(root, "init", "-q");
  await git(root, "config", "user.name", "Fixture");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await writeFile(join(root, "race.txt"), "base");
  await git(root, "add", "race.txt");
  await git(root, "commit", "-qm", "init");
  await writeFile(join(root, "race.txt"), "first");
  const result = await readGitChange(
    root,
    "index-worktree",
    "race.txt",
    async () => {
      await writeFile(join(root, "race.txt"), "second");
    },
  );
  expect(result).toMatchObject({ kind: "unavailable", reason: "changed" });
});

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
import { afterEach, expect, test } from "vitest";
import { listProjectFiles, readProjectFile } from "./project-files";

const roots: string[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "d-pi-s4-files-")));
  roots.push(root);
  return root;
}
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("lists project entries without following an escaping symlink", async () => {
  const root = await fixture();
  const outside = await fixture();
  await mkdir(join(root, "src"));
  await writeFile(join(root, "src", "main.ts"), "hello\n");
  await writeFile(join(outside, "secret"), "private");
  await symlink(join(outside, "secret"), join(root, "escape"));
  const tree = await listProjectFiles(root, "");
  expect(tree).toMatchObject({ kind: "entries" });
  if (tree.kind !== "entries") return;
  expect(tree.entries.map((entry) => entry.path)).toContain("src");
  expect(await readProjectFile(root, "escape")).toMatchObject({
    kind: "unavailable",
    reason: "denied",
  });
  expect(await readProjectFile(root, "src/main.ts")).toMatchObject({
    kind: "text",
    text: "hello\n",
  });
});

test("distinguishes empty, missing, binary, and oversized files", async () => {
  const root = await fixture();
  await writeFile(join(root, "empty"), "");
  await writeFile(join(root, "binary"), Buffer.from([0, 1, 2]));
  await writeFile(join(root, "large"), Buffer.alloc(1025));
  expect(await readProjectFile(root, "empty")).toMatchObject({
    kind: "text",
    text: "",
  });
  expect(await readProjectFile(root, "absent")).toMatchObject({
    kind: "unavailable",
    reason: "missing",
  });
  expect(await readProjectFile(root, "binary")).toMatchObject({
    kind: "unavailable",
    reason: "binary",
  });
  expect(await readProjectFile(root, "large", 1024)).toMatchObject({
    kind: "unavailable",
    reason: "too-large",
  });
  expect(await readProjectFile(root, "../outside")).toMatchObject({
    kind: "unavailable",
    reason: "denied",
  });
});

test("rejects non-utf8 bytes without nul as invalid encoding", async () => {
  const root = await fixture();
  await writeFile(join(root, "latin"), Buffer.from([0xff, 0xfe, 0xfd]));
  expect(await readProjectFile(root, "latin")).toMatchObject({
    kind: "unavailable",
    reason: "invalid-encoding",
  });
});

test("serves a project reached through a symlinked parent directory", async () => {
  const root = await fixture();
  await writeFile(join(root, "linked.txt"), "via link\n");
  const alias = join(tmpdir(), `d-pi-s4-alias-${process.pid}-${Date.now()}`);
  await symlink(root, alias);
  roots.push(alias);
  try {
    expect(await listProjectFiles(alias, "")).toMatchObject({
      kind: "entries",
    });
    expect(await readProjectFile(alias, "linked.txt")).toMatchObject({
      kind: "text",
      text: "via link\n",
    });
  } finally {
    await rm(alias, { force: true });
    roots.splice(roots.indexOf(alias), 1);
  }
});

test("rejects a file replaced during the read", async () => {
  const root = await fixture();
  await writeFile(join(root, "race"), "before");
  const result = await readProjectFile(root, "race", 1024, async () => {
    await writeFile(join(root, "race"), "after");
  });
  expect(result).toMatchObject({ kind: "unavailable", reason: "changed" });
});

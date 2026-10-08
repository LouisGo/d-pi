import {
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { NativeSessionBinding } from "../../../threads/contracts/public";
import { indexedSessionDirectory } from "./indexed-session-binding";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "d-pi-indexed-binding-")),
  );
  roots.push(root);
  const file = join(root, "original.jsonl");
  const body =
    JSON.stringify({
      type: "title",
      v: 1,
      title: "Original CLI",
      updatedAt: "2026-10-08T00:00:00Z",
      pad: "",
    }) +
    "\n" +
    JSON.stringify({ type: "session", version: 3, id: "native", cwd: root }) +
    "\n";
  writeFileSync(file, body);
  const binding: NativeSessionBinding = {
    threadId: crypto.randomUUID(),
    configContextId: "native-profile",
    sessionFile: file,
    sessionId: "native",
    historyRoot: root,
    origin: "cli",
  };
  return { root, file, body, binding };
}
it("accepts only the configured canonical native file with its original ID and project", async () => {
  const f = fixture();
  expect(await indexedSessionDirectory(f.root, f.binding, f.root)).toBe(f.root);
  for (const [configured, binding, directory] of [
    [null, f.binding, f.root],
    [tmpdir(), f.binding, f.root],
    [f.root, { ...f.binding, sessionId: "other" }, f.root],
    [f.root, { ...f.binding, historyRoot: tmpdir() }, f.root],
    [f.root, f.binding, tmpdir()],
    [f.root, null, f.root],
  ] as const)
    await expect(
      indexedSessionDirectory(configured, binding, directory),
    ).rejects.toMatchObject({ reason: "binding-changed" });
});
it("does not follow a substituted symlink or accept a damaged header", async () => {
  const f = fixture();
  const alias = join(f.root, "alias.jsonl");
  symlinkSync(f.file, alias);
  await expect(
    indexedSessionDirectory(
      f.root,
      { ...f.binding, sessionFile: alias },
      f.root,
    ),
  ).rejects.toMatchObject({ reason: "binding-changed" });
  writeFileSync(f.file, "secret-invalid-native-content");
  await expect(
    indexedSessionDirectory(f.root, f.binding, f.root),
  ).rejects.toMatchObject({
    reason: "binding-changed",
    message: "Native recovery unavailable: binding-changed",
  });
});

it("rejects a malformed leading title slot before launching the SDK", async () => {
  const f = fixture();
  writeFileSync(
    f.file,
    JSON.stringify({ type: "title", title: "invalid" }) +
      "\n" +
      f.body.split("\n").slice(1).join("\n"),
  );
  await expect(
    indexedSessionDirectory(f.root, f.binding, f.root),
  ).rejects.toMatchObject({ reason: "binding-changed" });
});

import { execFile, type SpawnOptions, spawn } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, expect, it } from "vitest";
import { createProjectGitReader } from "./project-git";

const run = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "d-pi-git-integrity-")),
  );
  roots.push(root);
  await run("git", ["-C", root, "init", "-q"]);
  await writeFile(join(root, "sample.txt"), "sample\n");
  return root;
}
function output(data: Buffer, options: SpawnOptions, exit = 0) {
  return spawn(
    process.execPath,
    [
      "-e",
      `process.stdout.write(Buffer.from(${JSON.stringify(data.toString("base64"))}, "base64"));process.exitCode=${exit};`,
    ],
    options,
  );
}
it("preserves a second-sample size failure instead of reporting an observed content change", async () => {
  const root = await fixture();
  const reader = createProjectGitReader();
  try {
    expect(
      await reader.diff(
        root,
        "untracked",
        "sample.txt",
        undefined,
        async () => {
          await writeFile(
            join(root, "sample.txt"),
            "x".repeat(5 * 1024 * 1024 + 1),
          );
        },
      ),
    ).toEqual({ kind: "unavailable", reason: "too-large" });
  } finally {
    await reader.close();
  }
});
it("preserves a final repository absence instead of inventing a changed baseline", async () => {
  const root = await fixture();
  const reader = createProjectGitReader();
  try {
    expect(
      await reader.diff(
        root,
        "untracked",
        "sample.txt",
        undefined,
        async () => {
          await rm(join(root, ".git"), { recursive: true, force: true });
        },
      ),
    ).toEqual({ kind: "unavailable", reason: "not-git" });
  } finally {
    await reader.close();
  }
});

it.each([
  {
    name: "failed config",
    data: Buffer.alloc(0),
    exit: 1,
    code: "process-exit",
  },
  {
    name: "incomplete config",
    data: Buffer.from("filter.private.clean\nPRIVATE BODY"),
    exit: 0,
    code: "malformed-output",
  },
  {
    name: "invalid UTF-8 config",
    data: Buffer.from([0xff, 0]),
    exit: 0,
    code: "malformed-output",
  },
])(
  "does not start diff when $name prevents proving filter protection",
  async ({ data, exit, code }) => {
    const root = await fixture();
    const commands: string[][] = [];
    const reader = createProjectGitReader({
      spawn: (command, args, options) => {
        commands.push(args);
        return args.includes("config")
          ? output(data, options, exit)
          : spawn(command, args, options);
      },
    });
    try {
      await expect(reader.list(root)).rejects.toMatchObject({
        code,
        retryable: false,
      });
      expect(commands.some((args) => args.includes("diff"))).toBe(false);
      expect(reader.snapshot()).toMatchObject({ active: 0, queued: 0 });
    } finally {
      await reader.close();
    }
  },
);
it("preserves a failed repository probe instead of returning an unknown business result", async () => {
  const root = await fixture();
  const reader = createProjectGitReader({
    spawn: (_command, _args, options) => output(Buffer.alloc(0), options, 1),
  });
  try {
    await expect(reader.list(root)).rejects.toMatchObject({
      code: "process-exit",
      retryable: false,
    });
  } finally {
    await reader.close();
  }
});
it.each([Buffer.from("broken.txt"), Buffer.from([0xff, 0])])(
  "rejects incomplete or invalid UTF-8 path records without dropping them",
  async (data) => {
    const root = await fixture();
    const reader = createProjectGitReader({
      spawn: (command, args, options) =>
        args.includes("--others")
          ? output(data, options)
          : spawn(command, args, options),
    });
    try {
      await expect(reader.list(root)).rejects.toMatchObject({
        code: "malformed-output",
        retryable: false,
      });
    } finally {
      await reader.close();
    }
  },
);
it("rejects an incomplete stage record before reading a diff body", async () => {
  const root = await fixture();
  const reader = createProjectGitReader({
    spawn: (command, args, options) =>
      args.includes("--stage")
        ? output(
            Buffer.from(
              "100644 0000000000000000000000000000000000000000 0\tsample.txt",
            ),
            options,
          )
        : spawn(command, args, options),
  });
  try {
    await expect(
      reader.diff(root, "untracked", "sample.txt"),
    ).rejects.toMatchObject({ code: "malformed-output", retryable: false });
  } finally {
    await reader.close();
  }
});

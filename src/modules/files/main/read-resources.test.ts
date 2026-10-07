import { execFileSync } from "node:child_process";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readProjectFile } from "./project-files";

it.skipIf(process.platform !== "darwin")(
  "confirms real FileHandle descriptors close after each cancelled capture",
  async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "d-pi-read-fd-")));
    const path = join(root, "sample.txt");
    const snapshots: number[] = [];
    const openCount = () =>
      execFileSync(
        "/usr/sbin/lsof",
        ["-n", "-P", "-a", "-p", String(process.pid), "-Ffn"],
        { encoding: "utf8" },
      )
        .split("\n")
        .filter((line) => line === `n${path}`).length;
    try {
      await writeFile(path, Buffer.alloc(3 * 1024 * 1024, "x"));
      snapshots.push(openCount());
      for (let attempt = 0; attempt < 3; attempt++) {
        const controller = new AbortController();
        await expect(
          readProjectFile(
            root,
            "sample.txt",
            undefined,
            async () => {
              snapshots.push(openCount());
              controller.abort();
            },
            controller.signal,
          ),
        ).rejects.toMatchObject({ name: "AbortError" });
        snapshots.push(openCount());
      }
      expect(snapshots).toEqual([0, 1, 0, 1, 0, 1, 0]);
      console.log(
        "READ_FILE_HANDLE_SAMPLE",
        JSON.stringify({
          captures: 3,
          bytesPerCapture: 3 * 1024 * 1024,
          openDescriptorCounts: snapshots,
          remainingHandles: snapshots.at(-1),
        }),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

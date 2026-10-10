import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { ConversationSnapshotSchema } from "../../src/modules/conversation/contracts/public";
import { ConversationModel } from "../../src/modules/conversation/core/public";
import { ConversationProjection } from "../../src/modules/conversation/host/public";
import { NativeFrameSchema } from "../../src/platform/omp/protocol/public";

const repository = resolve(import.meta.dirname, "../..");
it.skipIf(!existsSync(resolve(repository, "resources/sdk/bun")))(
  "projects actual fixed SDK localhost frames and restores the same native results through the Renderer model",
  () => {
    const directory = mkdtempSync(join(tmpdir(), "d-pi-observation-evidence-"));
    const evidencePath = join(directory, "new", "nested", "frames.json");
    try {
      expect(existsSync(dirname(evidencePath))).toBe(false);
      execFileSync(
        process.execPath,
        [
          resolve(repository, "runtime/native-subagent-observation-suite.mjs"),
          evidencePath,
        ],
        { cwd: repository, env: process.env, timeout: 45000, stdio: "pipe" },
      );
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
      const generation = crypto.randomUUID(),
        projection = new ConversationProjection(generation, () => {});
      try {
        for (const frame of evidence.frames)
          projection.accept(NativeFrameSchema.parse(frame));
        const snapshot = ConversationSnapshotSchema.parse(
          projection.snapshot(),
        );
        const agents = snapshot.items.filter((item) => item.subagent);
        expect(agents).toHaveLength(6);
        const initial = agents.slice(0, 2);
        expect(initial.map((item) => item.subagent?.nativeId)).toEqual([
          "first-task",
          "second-task",
        ]);
        expect(
          initial.every((item) => item.subagent?.status === "completed"),
        ).toBe(true);
        expect(initial.map((item) => item.text).sort()).toEqual([
          "M2_SUBAGENT_CHILD_RESULT_A",
          "M2_SUBAGENT_CHILD_RESULT_B",
        ]);
        expect(evidence.parentStopCancelsBoth).toBe(true);
        expect(evidence.continueDoesNotRetry).toBe(true);
        expect(evidence.explicitNewDelegationCompletes).toBe(true);
        expect(
          agents
            .slice(2, 4)
            .every((item) => item.subagent?.status === "aborted"),
        ).toBe(true);
        expect(
          agents
            .slice(4)
            .every((item) => item.subagent?.status === "completed"),
        ).toBe(true);
        expect(JSON.stringify(snapshot)).not.toContain("sessionFile");
        const model = new ConversationModel({
          connect: (_thread, listener) => {
            listener(snapshot);
            return () => {};
          },
        });
        model.connect("first-thread");
        model.connect("first-thread");
        expect(model.getSnapshot()).toEqual(snapshot);
        model.dispose();
      } finally {
        projection.dispose();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  },
  45000,
);

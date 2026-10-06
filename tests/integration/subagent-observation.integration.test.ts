import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { ConversationSnapshotSchema } from "../../src/modules/conversation/contracts/public";
import { ConversationModel } from "../../src/modules/conversation/core/public";
import { ConversationProjection } from "../../src/modules/conversation/host/public";
import { NativeFrameSchema } from "../../src/platform/omp/protocol/public";

const repository = resolve(import.meta.dirname, "../..");
it.skipIf(!existsSync(resolve(repository, "resources/sdk/bun")))(
  "projects actual fixed SDK localhost frames and restores the same native results through the Renderer model",
  () => {
    execFileSync(
      process.execPath,
      [resolve(repository, "runtime/native-subagent-observation-suite.mjs")],
      { cwd: repository, env: process.env, timeout: 45000, stdio: "pipe" },
    );
    const evidence = JSON.parse(
      readFileSync(
        resolve(repository, "dist/validation/05d-native-sdk-frames.json"),
        "utf8",
      ),
    );
    const generation = crypto.randomUUID(),
      projection = new ConversationProjection(generation, () => {});
    try {
      for (const frame of evidence.frames)
        projection.accept(NativeFrameSchema.parse(frame));
      const snapshot = ConversationSnapshotSchema.parse(projection.snapshot());
      const agents = snapshot.items.filter((item) => item.subagent);
      expect(agents).toHaveLength(2);
      expect(agents.map((item) => item.subagent?.nativeId)).toEqual([
        "first-task",
        "second-task",
      ]);
      expect(
        agents.every((item) => item.subagent?.status === "completed"),
      ).toBe(true);
      expect(agents.map((item) => item.text).sort()).toEqual([
        "M2_SUBAGENT_CHILD_RESULT_A",
        "M2_SUBAGENT_CHILD_RESULT_B",
      ]);
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
  },
  45000,
);

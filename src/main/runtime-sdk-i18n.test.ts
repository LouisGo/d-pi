import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { createI18n } from "../shared/i18n/create-i18n";
import { TraceIdSchema } from "../shared/identity";
import { RuntimeService } from "./runtime-service";
import { AppStorage } from "./storage/app-storage";

vi.mock("electron", () => ({
  utilityProcess: {
    fork: vi.fn(() => {
      throw Error("Must not start Host");
    }),
  },
}));

it("shows the SDK recovery command when managed SDK resources are missing", async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "d-pi-sdk-copy-")));
  const project = join(root, "project");
  mkdirSync(project);
  const store = new AppStorage(join(root, "app.sqlite"));
  try {
    const draft = store.drafts.create(project);
    const runtime = new RuntimeService(
      store,
      join(root, "missing-resources"),
      root,
      {},
      () => {},
    );
    const execute = (kind: "allow" | "start") =>
      runtime.execute({
        kind,
        threadId: draft.threadId,
        traceId: TraceIdSchema.parse(crypto.randomUUID()),
      });
    await execute("allow");
    const failed = await execute("start");
    expect(failed.phase).toBe("failed");
    expect(failed.message).toEqual({ code: "runtime.sdkResourcesUnavailable" });
    for (const locale of ["en-US", "zh-CN"] as const) {
      const message = createI18n(locale).t(failed.message.code);
      expect(message).toContain("pnpm runtime:sdk");
      expect(message).toContain(
        locale === "en-US" ? "complete app" : "完整应用",
      );
    }
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

// Fixed headless workload using production controller, service, SQLite and logger.
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { cpus, release, tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Diagnostics } from "../../../src/main/diagnostics";
import { DraftService, failure } from "../../../src/main/draft-service";
import { AppStorage } from "../../../src/main/storage/app-storage";
import { DraftController } from "../../../src/modules/input/core/public";

const directory = realpathSync(
  mkdtempSync(join(tmpdir(), "d-pi-s1-task-perf-")),
);
const body = Array.from(
  { length: 100 },
  (_, i) => `${i}: ${"S1 draft selection persistence response. ".repeat(5)}`,
).join("\n");
const results: unknown[] = [];
const modes = ["off", "on", "on", "off", "off", "on", "on", "off", "off", "on"];
// Two unreported warmups are fixed in advance; no measured run is discarded.
for (const [index, mode] of ["off", "on", ...modes].entries()) {
  const store = new AppStorage(join(directory, `task-${index}.sqlite`));
  const draft = store.drafts.create(directory);
  const service = new DraftService(store, async () => directory);
  const logger =
    mode === "on" ? new Diagnostics(join(directory, `logs-${index}`)) : null;
  const controller = new DraftController(
    draft,
    async (expectedRevision, text) => {
      const traceId = randomUUID();
      const context = {
        traceId,
        requestId: randomUUID(),
        connectionId: randomUUID(),
        operation: "save",
      };
      logger?.record({ ...context, stage: "received" });
      const started = performance.now();
      const reply = await service.execute({
        kind: "save",
        traceId,
        threadId: draft.threadId,
        expectedRevision,
        text,
      });
      logger?.record({
        ...context,
        stage: reply.kind === "failed" ? "failed" : "completed",
        durationMs: performance.now() - started,
      });
      if (reply.kind !== "saved") throw new Error("Replay failed");
      return reply;
    },
    () =>
      failure(randomUUID(), "transport-unavailable", "draft.transportUnknown")
        .error,
  );
  let resolveSaved: () => void = () => {};
  const saved = new Promise<void>((resolve) => {
    resolveSaved = resolve;
  });
  controller.subscribe(() => {
    if (controller.getSnapshot().kind === "saved") resolveSaved();
  });
  const started = performance.now();
  for (let key = 0; key < 32; key++) {
    controller.edit(
      body + "12345678901234567890123456789012".slice(0, key + 1),
    );
    if (key < 31) await delay(16);
  }
  await saved;
  const durationMs = performance.now() - started;
  if (store.drafts.active()?.text !== body + "12345678901234567890123456789012")
    throw new Error("Body mismatch");
  if (index >= 2) results.push({ run: index - 1, mode, durationMs });
  controller.dispose();
  await logger?.close();
  store.close();
}
const output = {
  machine: cpus()[0]?.model,
  os: release(),
  arch: process.arch,
  electron: process.versions.electron,
  node: process.versions.node,
  chars: body.length,
  intervalMs: 16,
  edits: 32,
  results,
};
writeFileSync(
  join(directory, "task-results.json"),
  JSON.stringify(output, null, 2),
);
console.log(JSON.stringify({ directory, ...output }, null, 2));

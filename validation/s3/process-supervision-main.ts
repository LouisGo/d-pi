import { randomUUID } from "node:crypto";
import { appendFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { NativeConfiguration } from "../../src/modules/configuration/main/public";
import { SubmissionIdSchema } from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/runtime/runtime-service";
import { ThreadIdSchema, TraceIdSchema } from "../../src/shared/identity";
import { databaseStop } from "./process-database-stop";

const root = process.argv.at(-2);
const resources = process.argv.at(-1);
if (!root || !resources) throw Error("Missing isolated harness paths");
app.setPath("userData", join(root, "electron"));
const log = (value: unknown) =>
  appendFileSync(join(root, "events.jsonl"), `${JSON.stringify(value)}\n`);
const timeout = setTimeout(() => {
  log({ failure: "timeout" });
  app.exit(1);
}, 40000);
app
  .whenReady()
  .then(async () => {
    if (process.env.D_PI_FAULT_MODE === "recover") {
      const store = AppStorage.open(join(root, "app.sqlite"));
      const prior = z
        .array(z.object({ threadId: ThreadIdSchema }))
        .parse(
          JSON.parse(
            await import("node:fs/promises").then((fs) =>
              fs.readFile(join(root, "recover-input.json"), "utf8"),
            ),
          ),
        );
      for (const item of prior) {
        const runtime = new RuntimeService(
          store,
          dirname(resources),
          join(root, "app-data"),
          {},
          () => {},
          () => {},
          () => {},
          item.threadId,
        );
        const view = await runtime.execute({
          kind: "inspect",
          threadId: item.threadId,
          traceId: TraceIdSchema.parse(randomUUID()),
        });
        log({
          event: "cold-recovered",
          threadId: item.threadId,
          phase: view.phase,
          receipts: store.submissions.list(item.threadId),
        });
      }
      store.close();
      writeFileSync(join(root, "recovered"), String(process.pid));
      clearTimeout(timeout);
      app.exit(0);
      return;
    }
    if (process.env.D_PI_FAULT_MODE === "sqlite") {
      await databaseStop(root, resources, log);
      writeFileSync(join(root, "ready"), String(process.pid));
      clearTimeout(timeout);
      app.exit(0);
      return;
    }
    const store = AppStorage.open(join(root, "app.sqlite"));
    const runtimes: RuntimeService[] = [];
    const threads: ReturnType<typeof store.threads.threadContext>[] = [];
    const mode = process.env.D_PI_FAULT_MODE ?? "busy";
    for (const name of ["a", "b"]) {
      const scope = join(root, name);
      const draft = store.drafts.create(realpathSync(scope));
      threads.push(store.threads.threadContext(draft.threadId));
      const runtime = new RuntimeService(
        store,
        dirname(resources),
        join(root, "app-data"),
        {
          PATH: "/usr/bin:/bin",
          HOME: root,
          TMPDIR: root,
          PI_CODING_AGENT_DIR: join(scope, "config"),
          PI_CONFIG_DIR: ".fixture-no-project",
          D_PI_FAULT_SCOPE: scope,
          D_PI_FAULT_TOOL: join(root, "tool.mjs"),
          D_PI_FAULT_BUN: join(resources, "bun"),
        },
        (view) =>
          log({
            scope: name,
            event: "runtime",
            phase: view.phase,
            busy: view.busy,
            interactions: view.interactions,
            control: view.control,
            message: view.message,
          }),
        (reply) => log({ scope: name, event: "submission", reply }),
        (event) => log({ scope: name, event: "diagnostic", ...event }),
        draft.threadId,
      );
      runtimes.push(runtime);
      for (const kind of ["allow", "start"] as const) {
        const view = await runtime.execute({
          kind,
          threadId: draft.threadId,
          traceId: TraceIdSchema.parse(randomUUID()),
        });
        if (kind === "start" && view.phase !== "ready")
          throw Error(`Runtime failed: ${view.message.code}`);
      }
      const binding = store.threads.nativeSessionBinding(draft.threadId);
      if (!binding) throw Error("Missing native binding");
      const submissionId = SubmissionIdSchema.parse(randomUUID());
      log({
        scope: name,
        event: "ready",
        threadId: draft.threadId,
        submissionId,
        sessionFile: binding.sessionFile,
      });
      if (mode !== "idle") {
        const text = `/fixture-${name === "b" ? "background" : mode}`;
        store.drafts.save(draft.threadId, 0, text);
        await runtime.submit({
          kind: "prepare",
          threadId: draft.threadId,
          submissionId,
          traceId: TraceIdSchema.parse(randomUUID()),
          revision: 1,
          text,
          delivery: "followUp",
        });
        await runtime.submit({
          kind: "dispatch",
          threadId: draft.threadId,
          submissionId,
        });
      }
    }
    if (mode === "idle") {
      // Four independent UI/history-style reads while both real OMP scopes
      // remain live. Keep this no-provider resource check in the existing harness.
      let reading = 0;
      let peak = 0;
      const configuration = new NativeConfiguration(
        dirname(resources),
        store.threads,
        join(root, "a"),
        {
          PATH: "/usr/bin:/bin",
          HOME: root,
          TMPDIR: root,
          PI_CODING_AGENT_DIR: join(root, "a", "config"),
          PI_CONFIG_DIR: ".fixture-no-project",
        },
        () => {},
        async () => {},
        (event) => {
          log({ event: "diagnostic", ...event });
          if (event.operation !== "configuration:snapshot:adapter") return;
          if (event.stage === "initiated") peak = Math.max(peak, ++reading);
          else reading--;
        },
      );
      try {
        const replies = await Promise.all(
          [0, 1, 0, 1].map(async (index) => {
            const thread = threads[index];
            if (!thread) throw Error("Missing query target");
            const scope = {
              kind: "thread" as const,
              threadId: thread.threadId,
              workingDirectoryId: thread.workingDirectoryId,
            };
            const traceId = randomUUID();
            const reply = await configuration.execute({
              kind: "snapshot",
              scope,
              traceId,
            });
            if (
              reply.kind !== "snapshot" ||
              reply.traceId !== traceId ||
              reply.scope.kind !== "thread" ||
              reply.scope.threadId !== thread.threadId ||
              reply.source.cwd !== thread.directory
            )
              throw Error("Snapshot identity/result unavailable");
            return reply;
          }),
        );
        if (peak !== 1 || reading !== 0 || replies.length !== 4)
          throw Error("Snapshot process concurrency exceeded");
        await new Promise((resolve) => setTimeout(resolve, 1600));
        for (const [index, runtime] of runtimes.entries()) {
          const thread = threads[index];
          if (!thread) throw Error("Missing runtime target");
          const view = await runtime.execute({
            kind: "inspect",
            threadId: thread.threadId,
            traceId: TraceIdSchema.parse(randomUUID()),
          });
          if (view.phase !== "ready")
            throw Error("Warm scope lost during concurrent reads");
        }
        log({
          event: "warm-read-liveness",
          scopes: runtimes.length,
          snapshots: replies.length,
          peakSnapshotProcesses: peak,
        });
      } finally {
        configuration.dispose();
      }
      writeFileSync(join(root, "ready"), String(process.pid));
      for (const runtime of runtimes) await runtime.closeIdle();
      log({ event: "idle-closed" });
      store.close();
      clearTimeout(timeout);
      app.exit(0);
    } else writeFileSync(join(root, "ready"), String(process.pid));
  })
  .catch((error: unknown) => {
    log({ failure: error instanceof Error ? error.message : "unknown" });
    clearTimeout(timeout);
    app.exit(1);
  });

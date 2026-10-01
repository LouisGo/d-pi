import { randomUUID } from "node:crypto";
import { appendFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app } from "electron";
import { z } from "zod";
import { AppStorage } from "../../src/app/main/wiring/app-storage";
import { SubmissionIdSchema } from "../../src/modules/execution/contracts/public";
import { RuntimeService } from "../../src/modules/execution/main/runtime-service";
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
    const mode = process.env.D_PI_FAULT_MODE ?? "busy";
    for (const name of ["a", "b"]) {
      const scope = join(root, name);
      const draft = store.drafts.create(realpathSync(scope));
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
    writeFileSync(join(root, "ready"), String(process.pid));
    if (mode === "idle") {
      for (const runtime of runtimes) await runtime.closeIdle();
      log({ event: "idle-closed" });
      store.close();
      clearTimeout(timeout);
      app.exit(0);
    }
  })
  .catch((error: unknown) => {
    log({ failure: error instanceof Error ? error.message : "unknown" });
    clearTimeout(timeout);
    app.exit(1);
  });

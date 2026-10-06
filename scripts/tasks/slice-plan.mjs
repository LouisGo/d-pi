import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readTaskRecords } from "./task-records.mjs";

// Plans select work, while statuses and blocking edges stay in owning tickets.
export function readSlicePlans(
  root,
  files,
  taskResult = readTaskRecords(root, files),
) {
  const plans = [];
  const issues = [...taskResult.issues];
  for (const sourcePath of [...files].sort()) {
    if (
      !/^\.scratch\/[^/]+\/spec\.md$/.test(sourcePath) ||
      !existsSync(resolve(root, sourcePath))
    )
      continue;
    const source = readFileSync(resolve(root, sourcePath), "utf8");
    const blocks = [
      ...source.matchAll(/^```implementation-plan\s*\n([\s\S]*?)^```\s*$/gm),
    ];
    const openings = [...source.matchAll(/^```implementation-plan\s*$/gm)]
      .length;
    if (openings !== blocks.length)
      issues.push(`SLICE-JSON: ${sourcePath}: unclosed plan block`);
    if (!blocks.length) continue;
    if (blocks.length > 1)
      issues.push(`SLICE-JSON: ${sourcePath}: use one array block`);
    const ids = new Set();
    for (const block of blocks) {
      let values;
      try {
        values = JSON.parse(block[1]);
      } catch {
        issues.push(`SLICE-JSON: ${sourcePath}: invalid JSON`);
        continue;
      }
      if (!Array.isArray(values) || !values.length) {
        issues.push(`SLICE-JSON: ${sourcePath}: nonempty array required`);
        continue;
      }
      for (const value of values) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          issues.push(`SLICE-FIELD: ${sourcePath}: plan object required`);
          continue;
        }
        const ref = `${sourcePath} (${value.id ?? "missing-id"})`;
        for (const field of Object.keys(value))
          if (!["id", "tickets", "hold"].includes(field))
            issues.push(`SLICE-FIELD: ${ref}: unknown ${field}`);
        if (
          typeof value.id !== "string" ||
          !/^[a-z0-9][a-z0-9-]*$/.test(value.id) ||
          ids.has(value.id)
        )
          issues.push(`SLICE-ID: ${ref}: unique scoped slug required`);
        ids.add(value.id);
        if (
          !Array.isArray(value.tickets) ||
          !value.tickets.length ||
          value.tickets.some(
            (id) => typeof id !== "string" || !/^\d+[a-z]?$/.test(id),
          ) ||
          new Set(value.tickets).size !== value.tickets.length
        ) {
          issues.push(
            `SLICE-TICKETS: ${ref}: nonempty unique task ID array required`,
          );
          continue;
        }
        const tasks = taskResult.tasks.filter(
          (task) =>
            dirname(task.path) === `${dirname(sourcePath)}/issues` &&
            value.tickets.includes(task.id),
        );
        for (const id of value.tickets)
          if (!tasks.some((task) => task.id === id))
            issues.push(`SLICE-TICKETS: ${ref}: missing task ${id}`);
        if (value.hold !== undefined) {
          if (
            !value.hold ||
            typeof value.hold !== "object" ||
            Array.isArray(value.hold)
          )
            issues.push(`SLICE-HOLD: ${ref}: task-to-reason object required`);
          else
            for (const [id, reason] of Object.entries(value.hold))
              if (
                !value.tickets.includes(id) ||
                typeof reason !== "string" ||
                !reason.trim()
              )
                issues.push(
                  `SLICE-HOLD: ${ref}: selected task and nonempty reason required (${id})`,
                );
        }
        plans.push({ ...value, sourcePath, tasks });
      }
    }
  }
  return { plans, issues };
}

export function describeSlicePlan(plan) {
  const brief = (task) => ({ id: task.id, path: task.path, title: task.title });
  const result = {
    spec: plan.sourcePath,
    slice: plan.id,
    notice:
      "Structural readiness only; verify authorization, leaf scope and write conflicts before dispatch.",
    ready: [],
    claimed: [],
    blocked: [],
    held: [],
    resolved: [],
  };
  for (const task of plan.tasks) {
    if (task.status === "resolved") result.resolved.push(brief(task));
    else if (Object.hasOwn(plan.hold ?? {}, task.id))
      result.held.push({
        ...brief(task),
        status: task.status,
        reason: plan.hold[task.id],
        by: task.blockers.map(brief),
      });
    else if (task.status === "claimed")
      result.claimed.push({ ...brief(task), by: task.blockers.map(brief) });
    else if (task.blockers.length)
      result.blocked.push({
        ...brief(task),
        by: task.blockers.map((blocker) => ({
          ...brief(blocker),
          status: blocker.status,
        })),
      });
    else result.ready.push(brief(task));
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const rootIndex = args.indexOf("--root");
  const root = resolve(
    rootIndex < 0 ? process.cwd() : args.splice(rootIndex, 2)[1],
  );
  const sliceIndex = args.indexOf("--slice");
  const slice = sliceIndex < 0 ? undefined : args.splice(sliceIndex, 2)[1];
  const sourcePath = args[0];
  if (
    args.length !== 1 ||
    !slice ||
    !/^\.scratch\/[^/]+\/spec\.md$/.test(sourcePath ?? "")
  )
    throw Error("Use pnpm plan:slice -- .scratch/<scope>/spec.md --slice <id>");
  const listed = spawnSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      `${dirname(sourcePath)}/`,
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (listed.error || listed.status !== 0)
    throw Error("task inventory unavailable: git did not complete");
  const state = readSlicePlans(root, [
    ...new Set(listed.stdout.split("\0").filter(Boolean)),
  ]);
  if (state.issues.length) {
    process.stderr.write(`${state.issues.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  const plan = state.plans.find(
    (value) => value.sourcePath === sourcePath && value.id === slice,
  );
  if (!plan)
    throw Error(`implementation plan not found: ${sourcePath} / ${slice}`);
  process.stdout.write(`${JSON.stringify(describeSlicePlan(plan), null, 2)}\n`);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `ERROR: slice plan unavailable (${error.message}); no result published\n`,
    );
    process.exitCode = 2;
  }
}

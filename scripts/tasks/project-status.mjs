import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readSlicePlans } from "./slice-plan.mjs";
import { readTaskRecords } from "./task-records.mjs";

const phases = ["G1", "M1", "M2", "M3", "基建"];
const labels = {
  engineering: {
    planned: "未实施",
    "in-progress": "实施中",
    partial: "部分完成",
    complete: "工程完成",
  },
  trial: {
    "not-delivered": "未交付",
    delivered: "已交付待试用",
    feedback: "已反馈待处理/复试",
    "not-applicable": "不适用",
  },
  acceptance: {
    pending: "待认可",
    accepted: "用户已认可",
    "not-applicable": "不适用",
  },
};
const fields = new Set([
  "id",
  "title",
  "phase",
  "engineering",
  "trial",
  "acceptance",
  "build",
  "evidence",
  "next",
  "current",
  "pending",
  "constraints",
]);
const escape = (value) =>
  String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
function localTarget(root, source, path) {
  if (typeof path !== "string" || !path || /^[a-z][a-z0-9+.-]*:/i.test(path))
    return null;
  const target = resolve(root, dirname(source), path);
  const within = relative(root, target);
  if (within.startsWith("../") || within === ".." || !existsSync(target))
    return null;
  return within;
}

export function readProjectStatus(root, files) {
  const taskResult = readTaskRecords(root, files);
  const sliceResult = readSlicePlans(root, files, taskResult);
  const issues = sliceResult.issues;
  const records = [];
  const sources = new Map([
    ...taskResult.tasks.map((task) => [task.path, task.source]),
    ...sliceResult.sources,
  ]);
  for (const sourcePath of [...files].sort()) {
    if (
      !/^\.scratch\/[^/]+\/spec\.md$/.test(sourcePath) ||
      !existsSync(resolve(root, sourcePath))
    )
      continue;
    const source = readFileSync(resolve(root, sourcePath), "utf8");
    const blocks = [
      ...source.matchAll(/^```project-status\s*\n([\s\S]*?)^```\s*$/gm),
    ];
    if (!blocks.length) {
      if (source.includes("```project-status"))
        issues.push(`STATUS-JSON: ${sourcePath}: unclosed status block`);
      continue;
    }
    sources.set(sourcePath, source);
    if (blocks.length > 1)
      issues.push(`STATUS-JSON: ${sourcePath}: use one array block`);
    for (const block of blocks) {
      let values;
      try {
        values = JSON.parse(block[1]);
      } catch {
        issues.push(`STATUS-JSON: ${sourcePath}: invalid JSON`);
        continue;
      }
      if (!Array.isArray(values) || values.length === 0) {
        issues.push(`STATUS-JSON: ${sourcePath}: nonempty array required`);
        continue;
      }
      for (const value of values) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          issues.push(`STATUS-JSON: ${sourcePath}: record object required`);
          continue;
        }
        const ref = `${sourcePath} (${value.id ?? "missing-id"})`;
        for (const field of Object.keys(value))
          if (!fields.has(field))
            issues.push(`STATUS-FIELD: ${ref}: unknown ${field}`);
        for (const field of ["id", "title", "next"])
          if (typeof value[field] !== "string" || !value[field].trim())
            issues.push(`STATUS-FIELD: ${ref}: ${field} required`);
        if (!/^[a-z0-9][a-z0-9-]*$/.test(value.id ?? ""))
          issues.push(`STATUS-ID: ${ref}: use a scoped stable slug`);
        if (!phases.includes(value.phase))
          issues.push(`STATUS-FIELD: ${ref}: invalid phase`);
        for (const field of Object.keys(labels))
          if (!Object.hasOwn(labels[field], value[field] ?? ""))
            issues.push(`STATUS-FIELD: ${ref}: invalid ${field}`);
        if (value.current !== undefined && typeof value.current !== "boolean")
          issues.push(`STATUS-FIELD: ${ref}: current must be boolean`);
        for (const field of ["build", "constraints"])
          if (value[field] !== undefined && typeof value[field] !== "string")
            issues.push(`STATUS-FIELD: ${ref}: ${field} must be text`);
        if (
          value.acceptance === "accepted" &&
          (!["delivered", "feedback"].includes(value.trial) ||
            !value.evidence?.length)
        )
          issues.push(
            `STATUS-ACCEPTANCE: ${ref}: acceptance requires delivered trial and feedback evidence`,
          );
        const evidence = [];
        const pending = [];
        for (const [field, targets] of [
          ["evidence", evidence],
          ["pending", pending],
        ]) {
          if (value[field] !== undefined && !Array.isArray(value[field])) {
            issues.push(`STATUS-FIELD: ${ref}: ${field} must be an array`);
            continue;
          }
          for (const path of value[field] ?? []) {
            const target = localTarget(root, sourcePath, path);
            if (!target)
              issues.push(
                `STATUS-LINK: ${ref}: missing/invalid ${field} target ${path}`,
              );
            else targets.push(target);
            if (
              field === "pending" &&
              !taskResult.tasks.some((task) => task.path === target)
            )
              issues.push(`STATUS-PENDING: ${ref}: no owning task ${path}`);
          }
        }
        records.push({ ...value, sourcePath, evidence, pending });
      }
    }
  }
  const ids = new Set();
  for (const record of records) {
    const id = `${record.phase}/${record.id}`;
    if (ids.has(id)) issues.push(`STATUS-ID: duplicated ${id}`);
    ids.add(id);
  }
  if (records.filter((record) => record.current).length !== 1)
    issues.push("STATUS-CURRENT: exactly one current scope required");
  const digest = createHash("sha256");
  for (const [path, source] of [...sources].sort(([a], [b]) =>
    a.localeCompare(b),
  ))
    digest.update(`${path}\0${source}\0`);
  return {
    records,
    tasks: taskResult.tasks,
    issues,
    digest: digest.digest("hex"),
    sourceCount: sources.size,
  };
}

export function renderProjectStatus(root, state, output) {
  const link = (path, title) =>
    `[${escape(title)}](${relative(
      dirname(resolve(root, output)),
      resolve(root, path),
    )
      .split("\\")
      .join("/")})`;
  const current = state.records.find((record) => record.current);
  const lines = [
    "# 项目总看板",
    "",
    "此页由所属规格的 `project-status` 块和任务的 `Status` / `Blocked by` 生成，禁止手工改进度。更新源后运行 `pnpm report:status:write`；`check` / `check:fast` 拒绝非法字段、依赖与陈旧结果。读取约定见 [任务约定](agents/issue-tracker.md#总看板读取约定)。",
    "",
    `当前工作：${link(current.sourcePath, current.title)}。${escape(current.next)}`,
    "",
    "工程完成、交付试用与用户认可独立；下面的计划不构成阶段授权。G1 按受影响能力验证，M1 是内部闭环，M2 是首版，M3 是后续增强。",
    "",
    "| 阶段 | 切片 / 规格 | 工程 | 试用 | 用户认可 | 构建 / 证据 | 下一步 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  const records = [...state.records].sort(
    (a, b) =>
      phases.indexOf(a.phase) - phases.indexOf(b.phase) ||
      a.id.localeCompare(b.id, "en", { numeric: true }) ||
      a.sourcePath.localeCompare(b.sourcePath),
  );
  for (const record of records)
    lines.push(
      `| ${record.phase} | ${link(record.sourcePath, record.title)} | ${labels.engineering[record.engineering]} | ${labels.trial[record.trial]} | ${labels.acceptance[record.acceptance]} | ${escape(record.build ?? "—")} ${record.evidence.map((path, index) => link(path, `证据${index + 1}`)).join(" · ")} | ${escape(record.next)} |`,
    );
  lines.push(
    "",
    "## 当前任务与真实阻塞",
    "",
    "这里只汇总未解决票。无工程依赖不代表已授权实施；历史候选及试用验收继续由所属规格限定。",
    "",
    "| 所属范围 / 任务 | 状态 | 未解决的工程依赖 |",
    "| --- | --- | --- |",
  );
  for (const task of state.tasks.filter((task) => task.status !== "resolved"))
    lines.push(
      `| ${link(task.path, `${task.path.split("/")[1]} / ${task.title}`)} | ${task.status} | ${task.blockers.length ? task.blockers.map((blocker) => link(blocker.path, blocker.id)).join("、") : "无；范围以所属规格为准"} |`,
    );
  lines.push("", "## 重要待决与继续边界", "");
  const pending = new Set(records.flatMap((record) => record.pending));
  for (const path of pending) {
    const task = state.tasks.find((entry) => entry.path === path);
    if (task.status !== "resolved")
      lines.push(
        `- ${link(path, task.title)}（${task.status}），影响及替代路径见所属票；记录存在不表示问题解决。`,
      );
  }
  for (const record of records.filter((record) => record.constraints))
    lines.push(
      `- ${link(record.sourcePath, record.title)}：${escape(record.constraints)}`,
    );
  lines.push(
    "",
    `<!-- source-sha256: ${state.digest}; sources: ${state.sourceCount} -->`,
    "",
  );
  return lines.join("\n");
}

export function checkStatusSnapshot(root, output, expected) {
  return !existsSync(resolve(root, output)) ||
    readFileSync(resolve(root, output), "utf8") !== expected
    ? `STATUS-STALE: ${output}: run pnpm report:status:write`
    : null;
}

function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const root = resolve(rootIndex < 0 ? process.cwd() : args[rootIndex + 1]);
  const writeIndex = args.indexOf("--write");
  const checkIndex = args.indexOf("--check");
  const output = args[(writeIndex >= 0 ? writeIndex : checkIndex) + 1];
  if (writeIndex >= 0 === checkIndex >= 0 || !output)
    throw Error("Use --write or --check with a report path");
  const listed = spawnSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "*.md",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (listed.error || listed.status !== 0)
    throw Error("status inventory unavailable: git did not complete");
  const state = readProjectStatus(root, [
    ...new Set(listed.stdout.split("\0").filter(Boolean)),
  ]);
  if (state.issues.length) {
    process.stderr.write(`${state.issues.join("\n")}\n`);
    process.exitCode = 1;
    return;
  }
  const expected = renderProjectStatus(root, state, output);
  if (writeIndex >= 0) {
    mkdirSync(dirname(resolve(root, output)), { recursive: true });
    writeFileSync(resolve(root, output), expected);
  } else {
    const stale = checkStatusSnapshot(root, output, expected);
    if (stale) {
      process.stderr.write(`${stale}\n`);
      process.exitCode = 1;
      return;
    }
  }
  process.stdout.write(
    `PASS: project status (${state.records.length} slices, ${state.tasks.length} tasks; engineering/trial/acceptance independent)\n`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `ERROR: project status tool failed (${error.message}); no result published\n`,
    );
    process.exitCode = 2;
  }
}

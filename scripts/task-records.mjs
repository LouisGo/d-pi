import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

// Shared by documentation validation and the generated board. Task state is
// written only in its owning issue; no parallel status registry is maintained.
export function readTaskRecords(root, files) {
  const tasks = [];
  const issues = [];
  for (const path of [...files].sort()) {
    if (!/^\.scratch\/[^/]+\/issues\/[^/]+\.md$/.test(path)) continue;
    if (!existsSync(resolve(root, path))) continue;
    const source = readFileSync(resolve(root, path), "utf8");
    const states = [...source.matchAll(/^Status:\s*([^\n]*)$/gm)];
    const status = states[0]?.[1].trim();
    if (
      states.length !== 1 ||
      !["open", "claimed", "resolved"].includes(status)
    )
      issues.push(
        `DOC-TASK-STATUS: ${path}: exactly one Status: open/claimed/resolved required`,
      );
    const dependencies = [...source.matchAll(/^Blocked by:\s*([^\n]*)$/gm)];
    const blocked = dependencies[0]?.[1].trim() ?? "none";
    const dependencyIds =
      blocked === "none" ? [] : blocked.split(",").map((id) => id.trim());
    if (
      dependencies.length > 1 ||
      dependencyIds.some((id) => !/^\d+[a-z]?$/.test(id)) ||
      new Set(dependencyIds).size !== dependencyIds.length
    )
      issues.push(
        `DOC-TASK-DEPENDENCY: ${path}: use same-slice task IDs or none`,
      );
    const id = basename(path).match(/^(\d+[a-z]?)(?:-|\.)/)?.[1];
    if (!id)
      issues.push(
        `DOC-TASK-ID: ${path}: expected NN or NNletter filename prefix`,
      );
    tasks.push({
      path,
      id,
      status,
      dependencyIds,
      title: source.match(/^#\s+(.+)$/m)?.[1] ?? basename(path, ".md"),
      source,
    });
  }
  const byScope = new Map();
  for (const task of tasks) {
    const key = `${dirname(task.path)}/${task.id}`;
    if (byScope.has(key))
      issues.push(`DOC-TASK-ID: ${task.path}: duplicated task ID ${task.id}`);
    byScope.set(key, task);
  }
  for (const task of tasks) {
    task.dependencies = task.dependencyIds
      .map((id) => byScope.get(`${dirname(task.path)}/${id}`))
      .filter(Boolean);
    task.blockers = task.dependencies.filter(
      (dependency) => dependency.status !== "resolved",
    );
    for (const id of task.dependencyIds)
      if (!byScope.has(`${dirname(task.path)}/${id}`))
        issues.push(`DOC-TASK-DEPENDENCY: ${task.path}: missing task ${id}`);
    if (task.status === "resolved" && task.blockers.length)
      issues.push(
        `DOC-TASK-DEPENDENCY: ${task.path}: resolved while dependencies remain open`,
      );
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(task) {
    if (visiting.has(task.path)) {
      issues.push(`DOC-TASK-CYCLE: ${task.path}`);
      return;
    }
    if (visited.has(task.path)) return;
    visiting.add(task.path);
    for (const dependency of task.dependencies) visit(dependency);
    visiting.delete(task.path);
    visited.add(task.path);
  }
  for (const task of tasks) visit(task);
  return { tasks, issues };
}

import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import {
  checkStatusSnapshot,
  readProjectStatus,
  renderProjectStatus,
} from "../../scripts/tasks/project-status.mjs";

const record = {
  id: "sample",
  title: "示例切片",
  phase: "M1",
  engineering: "complete",
  trial: "delivered",
  acceptance: "pending",
  build: "fixture-build",
  evidence: ["handoff.md"],
  next: "等待试用",
  current: true,
};
function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), "d-pi-status-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}
function spec(value) {
  return `# 示例\n\n\`\`\`project-status\n${JSON.stringify(value)}\n\`\`\`\n`;
}
test("aggregates independent engineering, trial and acceptance states and real blockers", (t) => {
  const files = {
    ".scratch/example/spec.md": spec([record]),
    ".scratch/example/handoff.md": "# 固定构建\n",
    ".scratch/example/issues/01-one.md": "# 一\nStatus: claimed\n",
    ".scratch/example/issues/02-two.md": "# 二\nStatus: open\nBlocked by: 01\n",
  };
  const root = fixture(t, files);
  const state = readProjectStatus(root, Object.keys(files));
  assert.deepEqual(state.issues, []);
  assert.equal(state.tasks[1].blockers[0].id, "01");
  const report = renderProjectStatus(root, state, "docs/status.md");
  assert.match(report, /工程完成.*已交付待试用.*待认可/);
  assert.match(report, /02-two.md/);
  assert.match(report, /fixture-build/);
  assert.doesNotMatch(report, /用户已认可/);
});
test("rejects invalid states, duplicate identities and accepted-without-trial claims", (t) => {
  const files = {
    ".scratch/example/spec.md": spec([
      { ...record, engineering: "done" },
      { ...record, trial: "not-delivered", acceptance: "accepted" },
    ]),
    ".scratch/example/handoff.md": "# 构建\n",
  };
  const state = readProjectStatus(fixture(t, files), Object.keys(files));
  assert.match(state.issues.join("\n"), /STATUS-FIELD.*engineering/);
  assert.match(state.issues.join("\n"), /STATUS-ID/);
  assert.match(state.issues.join("\n"), /STATUS-ACCEPTANCE/);
});
test("rejects missing evidence, missing important pending tasks, and multiple current scopes", (t) => {
  const files = {
    ".scratch/example/spec.md": spec([
      {
        ...record,
        evidence: ["missing.md"],
        pending: ["issues/99-missing.md"],
      },
      { ...record, id: "second" },
    ]),
    ".scratch/example/handoff.md": "# 构建\n",
  };
  const state = readProjectStatus(fixture(t, files), Object.keys(files));
  assert.match(state.issues.join("\n"), /STATUS-LINK.*missing.md/);
  assert.match(state.issues.join("\n"), /STATUS-PENDING.*99/);
  assert.match(state.issues.join("\n"), /STATUS-CURRENT/);
});
test("snapshot check fails after an owning issue changes even when displayed totals stay equal", (t) => {
  const files = {
    ".scratch/example/spec.md": spec([record]),
    ".scratch/example/handoff.md": "# 构建\n",
    ".scratch/example/issues/01-one.md": "# 一\nStatus: open\n",
  };
  const root = fixture(t, files);
  mkdirSync(join(root, "docs"));
  const initial = renderProjectStatus(
    root,
    readProjectStatus(root, Object.keys(files)),
    "docs/status.md",
  );
  writeFileSync(join(root, "docs/status.md"), initial);
  assert.equal(checkStatusSnapshot(root, "docs/status.md", initial), null);
  writeFileSync(
    join(root, ".scratch/example/issues/01-one.md"),
    files[".scratch/example/issues/01-one.md"] + "\n新的证据\n",
  );
  const changed = renderProjectStatus(
    root,
    readProjectStatus(root, Object.keys(files)),
    "docs/status.md",
  );
  assert.match(
    checkStatusSnapshot(root, "docs/status.md", changed),
    /STATUS-STALE/,
  );
  assert.equal(readFileSync(join(root, "docs/status.md"), "utf8"), initial);
});
test("malformed status JSON and unknown fields fail rather than silently disappearing", (t) => {
  const files = {
    ".scratch/a/spec.md": "```project-status\n{ broken }\n```\n",
    ".scratch/b/spec.md": spec([{ ...record, accepted: true }]),
    ".scratch/b/handoff.md": "# 构建\n",
  };
  const state = readProjectStatus(fixture(t, files), Object.keys(files));
  assert.match(state.issues.join("\n"), /STATUS-JSON/);
  assert.match(state.issues.join("\n"), /STATUS-FIELD.*accepted/);
});

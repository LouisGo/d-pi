import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { checkDocumentation } from "../../scripts/checks/check-documentation.mjs";
import { readProjectStatus } from "../../scripts/tasks/project-status.mjs";

const script = resolve(
  import.meta.dirname,
  "../../scripts/tasks/slice-plan.mjs",
);
const specPath = ".scratch/example/spec.md";
function fixture(t, plan, tickets) {
  const root = mkdtempSync(join(tmpdir(), "d-pi-slice-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const files = {
    [specPath]: `# Spec\n\n\`\`\`implementation-plan\n${JSON.stringify(plan)}\n\`\`\`\n`,
    ...Object.fromEntries(
      Object.entries(tickets).map(([id, source]) => [
        `.scratch/example/issues/${id}-task.md`,
        `# ${id}\n${source}\n`,
      ]),
    ),
  };
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  const git = spawnSync("git", ["init", "--quiet"], { cwd: root });
  assert.equal(git.status, 0);
  return { root, files };
}
function run(root, slice = "next") {
  return spawnSync(
    process.execPath,
    [script, "--root", root, specPath, "--slice", slice],
    { encoding: "utf8" },
  );
}

test("reports the full scoped frontier and recomputes fan-in after integration without writing sources", (t) => {
  const { root, files } = fixture(
    t,
    [{ id: "next", tickets: ["02", "03", "04"] }],
    {
      "01": "Status: resolved",
      "02": "Status: open\nBlocked by: 01",
      "03": "Status: open\nBlocked by: 01",
      "04": "Status: open\nBlocked by: 02, 03",
      "05": "Status: open",
    },
  );
  const initial = run(root);
  assert.equal(initial.status, 0, initial.stderr);
  const plan = JSON.parse(initial.stdout);
  assert.deepEqual(
    plan.ready.map((x) => x.id),
    ["02", "03"],
  );
  assert.deepEqual(
    plan.blocked.map((x) => [x.id, x.by.map((b) => b.id)]),
    [["04", ["02", "03"]]],
  );
  assert.equal(initial.stdout.includes("05-task"), false);
  for (const [path, source] of Object.entries(files))
    assert.equal(readFileSync(join(root, path), "utf8"), source);
  for (const id of ["02", "03"])
    writeFileSync(
      join(root, `.scratch/example/issues/${id}-task.md`),
      "Status: resolved\nBlocked by: 01\n",
    );
  const after = run(root);
  assert.equal(after.status, 0, after.stderr);
  assert.deepEqual(
    JSON.parse(after.stdout).ready.map((x) => x.id),
    ["04"],
  );
});

test("keeps claimed, held and out-of-plan blockers out of the ready set including letter IDs", (t) => {
  const { root } = fixture(
    t,
    [
      {
        id: "next",
        tickets: ["01a", "02", "03", "04"],
        hold: { "03": "await product answer" },
      },
    ],
    {
      "01": "Status: resolved",
      "01a": "Status: open\nBlocked by: 01",
      "02": "Status: claimed",
      "03": "Status: open",
      "04": "Status: open\nBlocked by: 05",
      "05": "Status: open",
    },
  );
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  const plan = JSON.parse(result.stdout);
  assert.deepEqual(
    plan.ready.map((x) => x.id),
    ["01a"],
  );
  assert.deepEqual(
    plan.claimed.map((x) => x.id),
    ["02"],
  );
  assert.deepEqual(
    plan.held.map((x) => [x.id, x.reason]),
    [["03", "await product answer"]],
  );
  assert.deepEqual(
    plan.blocked.map((x) => [x.id, x.by.map((b) => b.id)]),
    [["04", ["05"]]],
  );
});

test("invalid plans fail closed rather than silently dropping work", (t) => {
  for (const plan of [
    [{ id: "next", tickets: ["01", "01"] }],
    [{ id: "next", tickets: ["99"] }],
    [{ id: "next", tickets: [] }],
    [{ id: "next", tickets: ["01"], hold: { "02": "not selected" } }],
    [{ id: "next", tickets: ["01"], hold: { "01": "" } }],
    [{ id: "next", tickets: ["01"], status: "authorized" }],
    [
      { id: "next", tickets: ["01"] },
      { id: "next", tickets: ["01"] },
    ],
    { id: "next", tickets: ["01"] },
  ]) {
    const { root } = fixture(t, plan, {
      "01": "Status: open",
      "02": "Status: open",
    });
    const result = run(root);
    assert.equal(result.status, 1, `${JSON.stringify(plan)}: ${result.stderr}`);
    assert.equal(result.stdout, "");
  }
});

test("malformed and unclosed plan blocks fail as validation errors", (t) => {
  const { root } = fixture(t, [], { "01": "Status: open" });
  for (const source of [
    "```implementation-plan\n{broken}\n```\n",
    "```implementation-plan\n[]\n",
  ]) {
    writeFileSync(join(root, specPath), source);
    const result = run(root);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, "");
  }
});

test("invalid dependency graphs and missing slice selectors never produce a dispatch plan", (t) => {
  const { root } = fixture(t, [{ id: "next", tickets: ["01"] }], {
    "01": "Status: open\nBlocked by: 02",
    "02": "Status: open\nBlocked by: 01",
  });
  const cycle = run(root);
  assert.equal(cycle.status, 1);
  assert.match(cycle.stderr, /DOC-TASK-CYCLE/);
  assert.equal(cycle.stdout, "");
  writeFileSync(
    join(root, ".scratch/example/issues/02-task.md"),
    "Status: resolved\n",
  );
  const missing = run(root, "not-found");
  assert.equal(missing.status, 2);
  assert.equal(missing.stdout, "");
});

test("plan validation is wired into both standard gates, including scopes without board rows", (t) => {
  const { root, files } = fixture(t, [{ id: "next", tickets: ["99"] }], {
    "01": "Status: open",
  });
  const paths = Object.keys(files);
  assert.match(
    checkDocumentation(root, paths).issues.join("\n"),
    /SLICE-TICKETS.*missing task 99/,
  );
  assert.match(
    readProjectStatus(root, paths).issues.join("\n"),
    /SLICE-TICKETS.*missing task 99/,
  );
});

test("plan edits invalidate the board fingerprint even when the spec has no project-status row", (t) => {
  const { root, files } = fixture(t, [{ id: "next", tickets: ["01"] }], {
    "01": "Status: open",
  });
  const summaryPath = ".scratch/summary/spec.md";
  mkdirSync(dirname(join(root, summaryPath)), { recursive: true });
  writeFileSync(
    join(root, summaryPath),
    '```project-status\n[{"id":"summary","title":"Summary","phase":"基建","engineering":"in-progress","trial":"not-applicable","acceptance":"not-applicable","current":true,"next":"continue"}]\n```\n',
  );
  const paths = [...Object.keys(files), summaryPath];
  const before = readProjectStatus(root, paths);
  assert.deepEqual(before.issues, []);
  writeFileSync(
    join(root, specPath),
    '```implementation-plan\n[{"id":"next","tickets":["01"],"hold":{"01":"await answer"}}]\n```\n',
  );
  const after = readProjectStatus(root, paths);
  assert.deepEqual(after.issues, []);
  assert.notEqual(after.digest, before.digest);
});

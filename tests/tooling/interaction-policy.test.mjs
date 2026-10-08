import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { interactionViolations } from "../../scripts/checks/interaction-policy.mjs";

function boundedViolations(source) {
  const checker = new URL(
    "../../scripts/checks/interaction-policy.mjs",
    import.meta.url,
  );
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
    import { interactionViolations } from ${JSON.stringify(checker.href)};
    process.stdout.write(JSON.stringify(interactionViolations("src/fixture.tsx", ${JSON.stringify(source)})));
  `,
    ],
    { encoding: "utf8", timeout: 1000, maxBuffer: 64 * 1024 },
  );
  assert.equal(
    child.error,
    undefined,
    "interaction scanning must finish within the bounded child process",
  );
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

test("scans valid regular expressions with URL punctuation without swallowing subsequent UI violations", () => {
  const source = String.raw`const safe = !/[?#]/.test(value) && !/^https?:\/\/[^/]*@/.test(value);
    if (ready) /[?#]/.test(value);
    const pattern = /"cursor-pointer"/;
    const ratio = first / second / third;
    element.style.cursor = "pointer";`;
  assert.doesNotThrow(() => new Function(source));
  const issues = boundedViolations(source);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /UI-CURSOR/);
});

test("fails explicitly when a scanner token cannot advance instead of hanging or approving the source", () => {
  const issues = boundedViolations(
    "const invalid = #; element.style.cursor = 'pointer';",
  );
  assert.match(issues.join("\n"), /UI-SCAN: src\/fixture\.tsx:1:/);
});

test("does not interpret division around JSX as a regular expression or hide its cursor violations", () => {
  for (const dividend of [
    "left",
    "helpers.if(ready)",
    "helpers.return",
    "left!",
  ]) {
    const issues =
      boundedViolations(`const ratio = ${dividend} / <div className="cursor-pointer" /> / right;
      element.style.cursor = "pointer";`);
    assert.equal(issues.length, 2, dividend);
    assert.ok(issues.every((issue) => issue.startsWith("UI-CURSOR:")));
  }
});

test("rejects CSS hand cursors including comments, escapes and fallback values", () => {
  for (const source of [
    "a { cursor: pointer }",
    "a { CURSOR: po/**/inter !important }",
    "a { cursor: p\\6f inter }",
    "a { cursor: url(hand.cur), pointer }",
  ]) {
    assert.match(
      interactionViolations("src/app/renderer/link.css", source).join("\n"),
      /UI-CURSOR/,
    );
  }
  assert.deepEqual(
    interactionViolations(
      "src/app/renderer/link.css",
      "/* cursor: pointer */ a { cursor: text } .sash { cursor: ew-resize }",
    ),
    [],
  );
});

test("rejects utility, inline and imperative cursor bypasses without confusing pagination cursors", () => {
  for (const source of [
    '<a className="hover:cursor-pointer" />',
    'const variants = cva("!cursor-pointer");',
    '<a className="cursor-[pointer]" />',
    '<a className="[cursor:pointer]" />',
    '<a className="cursor-[url(hand.cur),_pointer]" />',
    '<a className="[cursor:pointer!important]" />',
    '<a style={{ cursor: "pointer" }} />',
    'element.style.cursor = "pointer";',
    'element.style.setProperty("cursor", "pointer");',
    'element.style.cssText = "cursor: pointer";',
    'element.setAttribute("style", "cursor: pointer");',
  ]) {
    assert.match(
      interactionViolations("src/app/renderer/link.tsx", source).join("\n"),
      /UI-CURSOR/,
    );
  }
  assert.deepEqual(
    interactionViolations(
      "src/app/renderer/list.tsx",
      'const cursor = page.next; const label = "pointer"; <a className="cursor-default" />; // cursor: pointer',
    ),
    [],
  );
});

test("selection opt-ins belong to the shared policy and native buttons cannot bypass shared states", () => {
  for (const source of [
    '<p className="select-text" />',
    '<p className="hover:select-all" />',
    '<p className="select-[text]" />',
    '<p className="[user-select:unset]" />',
    '<p style={{userSelect: "auto"}} />',
  ]) {
    assert.match(
      interactionViolations("src/app/renderer/content.tsx", source).join("\n"),
      /UI-SELECTION/,
    );
  }
  assert.match(
    interactionViolations(
      "src/app/renderer/content.css",
      ".all { user-select: text; }",
    ).join("\n"),
    /UI-SELECTION/,
  );
  assert.match(
    interactionViolations(
      "src/app/renderer/content.css",
      ".all { user-select: unset; }",
    ).join("\n"),
    /UI-SELECTION/,
  );
  assert.deepEqual(
    interactionViolations(
      "src/app/renderer/styles/interaction.css",
      "[data-selectable] { user-select: text; cursor: text; }",
    ),
    [],
  );
  assert.deepEqual(
    interactionViolations(
      "src/app/renderer/content.tsx",
      "<p data-selectable>content</p><Button />",
    ),
    [],
  );
  assert.match(
    interactionViolations(
      "src/modules/configuration/renderer/settings.tsx",
      "<button />",
    ).join("\n"),
    /UI-BUTTON/,
  );
  assert.deepEqual(
    interactionViolations(
      "src/modules/configuration/renderer/settings.tsx",
      '<button className="ui-button ui-button-primary" />',
    ),
    [],
  );
});

test("the interaction gate runs in fast checks and the full design entry", () => {
  const root = new URL("../../", import.meta.url);
  const { scripts } = JSON.parse(
    readFileSync(new URL("package.json", root), "utf8"),
  );
  assert.match(scripts["check:fast"], /pnpm lint:interaction/);
  assert.match(scripts["lint:interaction"], /interaction-policy\.mjs/);
  assert.match(scripts.check, /pnpm lint:design/);
  assert.match(
    readFileSync(new URL("scripts/checks/lint-design.mjs", root), "utf8"),
    /checkInteractionPolicy\(root\)/,
  );
});

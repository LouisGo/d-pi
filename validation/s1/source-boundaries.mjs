import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
for (const path of files("src")) {
  const text = readFileSync(path, "utf8");
  if (path.endsWith(".css") && !path.endsWith("/tokens.css")) {
    assert.ok(
      !/#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)\(/i.test(text),
      `raw color outside token source: ${path}`,
    );
    assert.ok(
      !/--[\w-]+\s*:/.test(text),
      `independent variable source: ${path}`,
    );
    assert.ok(
      !/\b\d+(?:\.\d+)?(?:rem|em)\b/.test(text),
      `independent visual scale: ${path}`,
    );
  }
  if (!path.includes("/components/icons/"))
    assert.ok(
      !/from\s+['"]@hugeicons\//.test(text),
      `vendor icon outside adapter: ${path}`,
    );
  if (path.includes("/shared/") || path.includes("/features/"))
    assert.ok(
      !/from\s+['"](?:react|@tiptap|@base-ui|@hugeicons)/.test(text),
      `GUI type crossing domain boundary: ${path}`,
    );
}
console.log(
  "PASS: token source and icon/domain import boundaries (narrow source checks; not a full CSS linter).",
);

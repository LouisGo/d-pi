import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../src/app/renderer/", import.meta.url);
const failures = [];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "i18n") scan(path);
      continue;
    }
    if (!entry.name.endsWith(".tsx") || entry.name.includes(".test."))
      continue;
    const lines = readFileSync(path, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (
        line.includes("i18n-ignore:") ||
        lines[index - 1]?.includes("i18n-ignore:")
      )
        continue;
      const source = line.replace(/\/\/.*$/, "");
      const directCopy =
        /<[A-Za-z][\w.-]*(?:\s[^<>]*)?>\s*[^<{]*[\p{L}][^<{]*</u.test(
          source,
        );
      const literalLabel =
        /(?:aria-label|placeholder|title)\s*=\s*["'][^"']*[\p{L}]/u.test(
          source,
        );
      if (/\p{Script=Han}/u.test(source) || directCopy || literalLabel)
        failures.push(`${path}:${index + 1}`);
    }
  }
}

scan(fileURLToPath(root));
if (failures.length) {
  console.error(`Obvious hardcoded UI copy:\n${failures.join("\n")}`);
  process.exitCode = 1;
}

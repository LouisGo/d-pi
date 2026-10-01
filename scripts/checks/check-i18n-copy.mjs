import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function parseRoot(argv) {
  const index = argv.indexOf("--root");
  return resolve(
    index === -1 ? resolve(import.meta.dirname, "../..") : argv[index + 1],
  );
}

const root = parseRoot(process.argv.slice(2));
const failures = [];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "i18n") scan(path);
      continue;
    }
    if (!entry.name.endsWith(".tsx") || entry.name.includes(".test.")) continue;
    const lines = readFileSync(path, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (
        line.includes("i18n-ignore:") ||
        lines[index - 1]?.includes("i18n-ignore:")
      )
        continue;
      const source = line.replace(/\/\/.*$/, "");
      const directCopy =
        /<[A-Za-z][\w.-]*(?:\s[^<>]*)?>\s*[^<{]*[\p{L}][^<{]*</u.test(source);
      const literalLabel =
        /(?:aria-label|placeholder|title)\s*=\s*["'][^"']*[\p{L}]/u.test(
          source,
        );
      if (/\p{Script=Han}/u.test(source) || directCopy || literalLabel)
        failures.push(`${path}:${index + 1}`);
    }
  }
}

const rendererRoots = [join(root, "src/app/renderer")];
const modulesRoot = join(root, "src/modules");
if (existsSync(modulesRoot)) {
  for (const entry of readdirSync(modulesRoot, { withFileTypes: true })) {
    if (entry.isDirectory())
      rendererRoots.push(join(modulesRoot, entry.name, "renderer"));
  }
}
for (const rendererRoot of rendererRoots)
  if (existsSync(rendererRoot)) scan(rendererRoot);
if (failures.length) {
  console.error(`Obvious hardcoded UI copy:\n${failures.join("\n")}`);
  process.exitCode = 1;
}

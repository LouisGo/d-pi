import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const graph = JSON.parse(
  execFileSync("pnpm", ["list", "--prod", "--depth", "Infinity", "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  }),
);
const packages = new Map();
function visit(dependencies = {}) {
  for (const [name, info] of Object.entries(dependencies)) {
    const key = `${name}@${info.version}`;
    if (packages.has(key)) continue;
    packages.set(key, info.path);
    visit(info.dependencies);
  }
}
visit(graph[0].dependencies);
const previous = readFileSync("THIRD_PARTY_NOTICES.md", "utf8").split(
  "## Bundled dependencies",
)[0];
let text =
  previous +
  "## Bundled dependencies\n\nLicense files from the locked production dependency graph; no development tools are shipped.\n";
for (const [name, path] of [...packages].sort()) {
  const license = readdirSync(path).find((file) =>
    /^licen[cs]e(?:\.\w+)?$/i.test(file),
  );
  if (!license) throw Error(`Missing license: ${name}`);
  text += `\n### ${name}\n\n\`\`\`text\n${readFileSync(join(path, license), "utf8")}\n\`\`\`\n`;
}
writeFileSync("THIRD_PARTY_NOTICES.md", text);
console.log(`Recorded ${packages.size} production license notices.`);

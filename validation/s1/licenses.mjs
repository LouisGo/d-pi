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
const previous = readFileSync("THIRD_PARTY_NOTICES.md", "utf8");
const generatedHeading = "## Bundled dependencies";
const generatedStart = previous.indexOf(generatedHeading);
if (generatedStart < 0)
  throw Error("Missing generated dependency section in THIRD_PARTY_NOTICES.md");
const afterHeading = previous.slice(generatedStart + generatedHeading.length);
const nextSection = afterHeading.search(/^## /m);
// Only this section belongs to the UI dependency generator. SDK, Bun and
// manually preserved upstream notices remain separate, even when listed later.
const suffix = nextSection < 0 ? "" : afterHeading.slice(nextSection);
let text =
  previous.slice(0, generatedStart) +
  "## Bundled dependencies\n\nLicense files from the locked UI dependency graph. The official OMP SDK dependency closure and Bun runtime are also shipped; their original license files are retained in `Contents/Resources/sdk/node_modules` and `Contents/Resources/sdk/BUN-LICENSE.md`.\n";
for (const [name, path] of [...packages].sort()) {
  const license = readdirSync(path).find((file) =>
    /^licen[cs]e(?:\.\w+)?$/i.test(file),
  );
  if (!license) throw Error(`Missing license: ${name}`);
  text += `\n### ${name}\n\n\`\`\`text\n${readFileSync(join(path, license), "utf8")}\n\`\`\`\n`;
}
writeFileSync("THIRD_PARTY_NOTICES.md", text + (suffix ? `\n${suffix}` : ""));
console.log(`Recorded ${packages.size} production license notices.`);

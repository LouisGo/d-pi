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
let nextSection = -1;
let offset = 0;
let fence;
for (const line of afterHeading.match(/[^\n]*(?:\n|$)/g) ?? []) {
  const marker = line.trimEnd().match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (fence) {
    if (
      marker &&
      marker[1][0] === fence[0] &&
      marker[1].length >= fence.length &&
      !marker[2].trim()
    )
      fence = undefined;
  } else if (marker) fence = marker[1];
  else if (/^## /.test(line)) {
    nextSection = offset;
    break;
  }
  offset += line.length;
}
if (fence) throw Error("Unclosed license fence; original notices left intact");
// Only this section belongs to the application dependency generator. SDK, Bun and
// manually preserved upstream notices remain separate, even when listed later.
const suffix = nextSection < 0 ? "" : afterHeading.slice(nextSection);
let text =
  previous.slice(0, generatedStart) +
  "## Bundled dependencies\n\nLicense files from the locked application dependency graph. The official OMP SDK dependency closure and Bun runtime are also shipped; their original license files are retained in `Contents/Resources/sdk/node_modules` and `Contents/Resources/sdk/BUN-LICENSE.md`.\n";
for (const [name, path] of [...packages].sort()) {
  const license = readdirSync(path).find((file) =>
    /^licen[cs]e(?:\.\w+)?$/i.test(file),
  );
  if (!license) throw Error(`Missing license: ${name}`);
  const licenseText = readFileSync(join(path, license), "utf8");
  const longest = [...licenseText.matchAll(/`+/g)].reduce(
    (length, match) => Math.max(length, match[0].length),
    2,
  );
  const delimiter = "`".repeat(longest + 1);
  text += `\n### ${name}\n\n${delimiter}text\n${licenseText}\n${delimiter}\n`;
}
writeFileSync("THIRD_PARTY_NOTICES.md", text + (suffix ? `\n${suffix}` : ""));
console.log(`Recorded ${packages.size} production license notices.`);

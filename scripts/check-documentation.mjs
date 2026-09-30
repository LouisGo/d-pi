import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readTaskRecords } from "./task-records.mjs";

// Historical snapshots keep original paths. Links from current documents to
// those snapshots are checked; their contents are not rewritten or gated.
const historicalRoots = ["docs/archive/pre-reset/"];

function markdownSource(source) {
  return source.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "");
}

function linksOf(source) {
  const definitions = new Map();
  for (const match of source.matchAll(
    /^\s{0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm,
  ))
    definitions.set(match[1].toLowerCase(), match[2]);
  const links = [
    ...source.matchAll(/\[[^\]\n]*\]\(((?:[^()]|\([^)]*\))*)\)/g),
  ].map((match) => match[1]);
  for (const match of source.matchAll(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const reference = (match[2] || match[1]).toLowerCase();
    if (definitions.has(reference)) links.push(definitions.get(reference));
  }
  // Reference definitions are also checked even if used through a shortcut.
  links.push(...definitions.values());
  return links;
}

function targetOf(link) {
  const trimmed = link.trim();
  return trimmed.startsWith("<")
    ? trimmed.slice(1, trimmed.indexOf(">"))
    : trimmed.split(/\s+["']/)[0];
}

function anchorsOf(source) {
  const anchors = new Set();
  const seen = new Map();
  for (const match of markdownSource(source).matchAll(
    /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm,
  )) {
    const slug = match[1]
      .replace(/<[^>]*>/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, "")
      .replace(/\s/g, "-");
    const count = seen.get(slug) ?? 0;
    anchors.add(count === 0 ? slug : `${slug}-${count}`);
    seen.set(slug, count + 1);
  }
  for (const match of source.matchAll(/\b(?:id|name)=["']([^"']+)["']/g))
    anchors.add(match[1]);
  return anchors;
}

export function checkDocumentation(root, files) {
  const issues = readTaskRecords(root, files).issues;
  const decisionsPath = resolve(root, "docs/decisions.md");
  const decisions = existsSync(decisionsPath)
    ? readFileSync(decisionsPath, "utf8")
    : "";
  const decisionIds = new Set(
    [...decisions.matchAll(/^\|\s*(D-\d+)\s*\|/gm)].map((match) => match[1]),
  );
  let checked = 0;
  let skipped = 0;
  for (const file of files) {
    const entry = file.startsWith(".scratch/")
      ? /^\.scratch\/[^/]+\/(?:spec|handoff)\.md$/.test(file) ||
        /^\.scratch\/[^/]+\/issues\/.+\.md$/.test(file) ||
        file.startsWith(".scratch/rewrite-preparation/")
      : !file.includes("/") ||
        file.startsWith("docs/") ||
        file.startsWith(".agents/skills/") ||
        file.endsWith("/AGENTS.md") ||
        file.endsWith("/README.md");
    if (!entry) continue;
    if (
      extname(file) !== ".md" ||
      historicalRoots.some((prefix) => file.startsWith(prefix))
    ) {
      skipped += 1;
      continue;
    }
    if (!existsSync(resolve(root, file))) {
      skipped += 1;
      continue;
    }
    const source = markdownSource(readFileSync(resolve(root, file), "utf8"));
    checked += 1;
    for (const match of source.matchAll(/\bD-\d+\b/g))
      if (!decisionIds.has(match[0]))
        issues.push(
          `DOC-DECISION: ${file} references unknown ${match[0]} in docs/decisions.md`,
        );
    for (const link of linksOf(source)) {
      const target = targetOf(link);
      if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//"))
        continue;
      const [localPath, rawFragment] = target.split("#");
      let path;
      let fragment;
      try {
        path = localPath
          ? resolve(
              dirname(resolve(root, file)),
              decodeURIComponent(localPath.split("?")[0]),
            )
          : resolve(root, file);
        fragment = rawFragment ? decodeURIComponent(rawFragment) : undefined;
      } catch {
        issues.push(`DOC-LINK: ${file} -> ${target}: invalid URL encoding`);
        continue;
      }
      if (!existsSync(path)) {
        issues.push(`DOC-LINK: ${file} -> ${target}: target is missing`);
        continue;
      }
      if (
        fragment &&
        extname(path) === ".md" &&
        !anchorsOf(readFileSync(path, "utf8")).has(fragment)
      )
        issues.push(`DOC-ANCHOR: ${file} -> ${target}: anchor is missing`);
    }
  }
  return { issues: [...new Set(issues)], checked, skipped };
}

function main() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const root = resolve(
    rootIndex < 0 ? process.cwd() : (args[rootIndex + 1] ?? "."),
  );
  const listed = spawnSync(
    "git",
    [
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      "*.md",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (listed.error || listed.status !== 0) {
    process.stderr.write(
      "FAIL: documentation inventory unavailable; git ls-files did not run successfully.\n",
    );
    process.exitCode = 2;
    return;
  }
  const result = checkDocumentation(root, [
    ...new Set(listed.stdout.split("\0").filter(Boolean)),
  ]);
  if (result.issues.length > 0) {
    for (const issue of result.issues) process.stderr.write(`${issue}\n`);
    process.exitCode = 1;
  } else
    process.stdout.write(
      `PASS: documentation references (${result.checked} Markdown files; ${result.skipped} historical snapshots excluded; external URLs not fetched)\n`,
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main();

import { readFileSync } from "node:fs";
import { join } from "node:path";

// Required substrate only, not a translation of every decision into a rule.
// Versions stay in package.json and the lock; these names enforce D-07, D-17 and
// D-31–D-38 plus the existing React/TS/Electron/pnpm/Tailwind baseline.
const required = {
  dependencies: [
    "@base-ui/react",
    "@formatjs/intl",
    "@hugeicons/core-free-icons",
    "@hugeicons/react",
    "@tanstack/react-query",
    "@tanstack/react-router",
    "@tiptap/core",
    "@tiptap/extension-document",
    "@tiptap/extension-paragraph",
    "@tiptap/extension-text",
    "@tiptap/extensions",
    "@tiptap/pm",
    "@tiptap/react",
    "monaco-editor",
    "react",
    "react-dom",
    "ts-pattern",
    "zod",
    "zustand",
  ],
  devDependencies: [
    "@biomejs/biome",
    "@oh-my-pi/pi-coding-agent",
    "@oh-my-pi/pi-utils",
    "@shadcn/lint",
    "@tailwindcss/vite",
    "@tanstack/router-cli",
    "@tanstack/router-plugin",
    "bun",
    "electron",
    "electron-vite",
    "oxlint",
    "tailwindcss",
    "typescript",
    "vitest",
  ],
};
const sections = ["dependencies", "devDependencies", "optionalDependencies"];
const exactVersion = /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/;
const unquote = (value) => value.replace(/^(?:'([^']*)'|"([^"]*)")$/, "$1$2");

// Intentionally reads only pnpm v9's root importer. It is not a general YAML
// parser, and refuses unfamiliar structures instead of guessing consistency.
function rootImporter(contents, packageManager) {
  const documents = contents
    .replaceAll("\r", "")
    .split(/^---\s*$/m)
    .filter((text) => text.trim());
  if (documents.length === 1) return documentImporter(documents[0], sections);
  if (documents.length !== 2)
    throw new Error(
      "expected one package-manager document and one application document",
    );
  const importers = documents.map((text) =>
    documentImporter(text, [...sections, "packageManagerDependencies"]),
  );
  const manager = importers.filter((value) =>
    Object.hasOwn(value, "packageManagerDependencies"),
  );
  const application = importers.filter(
    (value) => !Object.hasOwn(value, "packageManagerDependencies"),
  );
  if (
    manager.length !== 1 ||
    application.length !== 1 ||
    sections.some((section) => Object.hasOwn(manager[0], section))
  )
    throw new Error(
      "expected one package-manager document and one application document",
    );
  const tools = manager[0].packageManagerDependencies;
  const version = packageManager?.startsWith("pnpm@")
    ? packageManager.slice("pnpm@".length)
    : undefined;
  if (!version || !exactVersion.test(version) || !Object.hasOwn(tools, "pnpm"))
    throw new Error("expected a pinned pnpm package-manager entry");
  for (const [name, entry] of Object.entries(tools)) {
    if (name !== "pnpm" && name !== "@pnpm/exe")
      throw new Error(`unsupported package-manager dependency ${name}`);
    if (entry.specifier !== version || entry.version !== version)
      throw new Error(
        `${name} disagrees with packageManager ${packageManager}`,
      );
  }
  return application[0];
}

function documentImporter(contents, allowedSections) {
  if (!/^lockfileVersion: ['"]?9\.0['"]?\s*$/m.test(contents))
    throw new Error("expected pnpm lockfileVersion 9.0");
  const result = {};
  let inImporters = false;
  let inRoot = false;
  let section;
  let dependency;
  for (const line of contents.replaceAll("\r", "").split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!inImporters) {
      if (line === "importers:") inImporters = true;
      continue;
    }
    if (!inRoot) {
      if (/^  ['"]?\.['"]?:\s*$/.test(line)) inRoot = true;
      else if (!line.startsWith(" ")) break;
      continue;
    }
    if (!line.startsWith("    ")) break;
    if (line === "    configDependencies: {}") {
      section = undefined;
      dependency = undefined;
      continue;
    }
    const sectionMatch = /^    (\w+):(?:\s*\{\})?\s*$/.exec(line);
    if (sectionMatch && allowedSections.includes(sectionMatch[1])) {
      section = sectionMatch[1];
      if (result[section])
        throw new Error(`duplicate importer section ${section}`);
      result[section] = {};
      dependency = undefined;
      continue;
    }
    const dependencyMatch = /^      (\S+):\s*$/.exec(line);
    if (dependencyMatch && section) {
      dependency = unquote(dependencyMatch[1]);
      if (result[section][dependency])
        throw new Error(`duplicate importer dependency ${dependency}`);
      result[section][dependency] = {};
      continue;
    }
    const fieldMatch = /^        (specifier|version):\s*(\S+)\s*$/.exec(line);
    if (fieldMatch && section && dependency) {
      const field = fieldMatch[1];
      if (result[section][dependency][field])
        throw new Error(`duplicate importer field ${dependency}.${field}`);
      result[section][dependency][field] = unquote(fieldMatch[2]);
      continue;
    }
    throw new Error(`unsupported root importer line: ${line.trim()}`);
  }
  if (!inRoot) throw new Error("root importer is missing");
  return result;
}

export function inspectDependencyContract(root, manifest) {
  const issues = [];
  const declared = {};
  for (const section of sections) {
    const values = manifest[section] ?? {};
    if (typeof values !== "object" || Array.isArray(values)) {
      issues.push(`DEP-DECLARATION: ${section} must be an object`);
      continue;
    }
    for (const name of required[section] ?? [])
      if (!Object.hasOwn(values, name))
        issues.push(`DEP-REQUIRED: ${name} must be declared in ${section}`);
    for (const [name, version] of Object.entries(values)) {
      if (Object.hasOwn(declared, name))
        issues.push(
          `DEP-DECLARATION: ${name} appears in multiple dependency sections`,
        );
      declared[name] = version;
      if (typeof version !== "string" || !exactVersion.test(version))
        issues.push(
          `DEP-EXACT: ${name} must declare one exact version, received ${version}`,
        );
    }
  }
  if (declared.zod && !/^4\./.test(declared.zod))
    issues.push("DEP-MAJOR: zod must use the confirmed v4 standard package");
  const families = [
    Object.keys(declared).filter((name) => name.startsWith("@tiptap/")),
    ["react", "react-dom"],
    ["tailwindcss", "@tailwindcss/vite"],
    ["@oh-my-pi/pi-coding-agent", "@oh-my-pi/pi-utils"],
  ];
  for (const family of families) {
    const present = family.filter((name) => declared[name]);
    if (new Set(present.map((name) => declared[name])).size > 1)
      issues.push(
        `DEP-FAMILY: versions must agree: ${present.map((name) => `${name}@${declared[name]}`).join(", ")}`,
      );
  }
  let importer;
  try {
    importer = rootImporter(
      readFileSync(join(root, "pnpm-lock.yaml"), "utf8"),
      manifest.packageManager,
    );
  } catch (error) {
    issues.push(
      `DEP-LOCK-FORMAT: cannot inspect root lock importer (${error.message})`,
    );
    return issues;
  }
  for (const section of sections) {
    const declaredValues = manifest[section] ?? {};
    const lockedValues = importer[section] ?? {};
    for (const [name, version] of Object.entries(declaredValues)) {
      const entry = lockedValues[name];
      if (
        entry?.specifier !== version ||
        entry?.version?.split("(")[0] !== version
      )
        issues.push(
          `DEP-LOCK: ${name} ${section} declaration ${version} disagrees with the root lock specifier/resolution`,
        );
    }
    for (const name of Object.keys(lockedValues))
      if (!Object.hasOwn(declaredValues, name))
        issues.push(
          `DEP-LOCK: ${name} remains in locked ${section} without a package.json declaration`,
        );
  }
  return issues;
}

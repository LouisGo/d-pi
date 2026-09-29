import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(join(directory, entry.name))
      : [join(directory, entry.name)],
  );
}
for (const path of files("src")) {
  const text = readFileSync(path, "utf8");
  if (/\.[cm]?tsx?$/.test(path) && !path.endsWith(".test.ts")) {
    for (const [, specifier] of text.matchAll(
      /(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g,
    )) {
      const target = specifier.startsWith(".")
        ? normalize(join(dirname(path), specifier))
        : specifier;
      const normalized = path.replaceAll("\\\\", "/");
      const environment = normalized.startsWith("src/modules/")
        ? normalized.split("/")[3]
        : normalized.startsWith("src/app/") ||
            normalized.startsWith("src/platform/")
          ? normalized.split("/")[2]
          : normalized.startsWith("src/shared/")
            ? "shared"
            : undefined;
      if (environment === "contracts" || environment === "core")
        assert.ok(
          !/^(?:node:|electron$|(?:react|react-dom)(?:\/|$)|@tiptap\/|@base-ui\/|@hugeicons\/)/.test(
            target,
          ),
          `platform or GUI implementation imported by ${environment}: ${path} -> ${target}`,
        );
      if (environment === "renderer")
        assert.ok(
          !/^(?:node:|electron$)/.test(target),
          `Node/Electron implementation imported by Renderer: ${path} -> ${target}`,
        );
    }
  }
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
  if (path.includes("/shared/"))
    assert.ok(
      !/from\s+['"](?:node:|electron$|react|react-dom|@tiptap|@base-ui|@hugeicons)/.test(
        text,
      ),
      `GUI/runtime type crossing shared boundary: ${path}`,
    );
}
console.log(
  "PASS: token source, icon/domain and module environment boundaries (narrow source checks; architecture gate is authoritative for dependency graph).",
);

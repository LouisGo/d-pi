import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
export default defineConfig(({ command }) => {
  const nonce = randomUUID();
  let commit = "unknown";
  let dirty = true;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    dirty =
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim().length > 0;
  } catch {
    /* Source exports without Git retain an explicit unknown identity. */
  }
  const { version } = JSON.parse(
    readFileSync(new URL("./package.json", import.meta.url), "utf8"),
  );
  const build = {
    version,
    commit,
    dirty,
    id: `${commit.slice(0, 8)}${dirty ? "-dirty" : ""}-${randomUUID().slice(0, 8)}`,
  };
  const define = { __D_PI_BUILD__: JSON.stringify(build) };
  return {
    main: { define, build: { externalizeDeps: false } },
    preload: {
      define,
      build: {
        externalizeDeps: false,
        rollupOptions: {
          output: { format: "cjs", entryFileNames: "index.cjs" },
        },
      },
    },
    renderer: {
      define,
      resolve: { alias: { "@": resolve("src/renderer") } },
      html: command === "serve" ? { cspNonce: nonce } : {},
      build: { minify: true },
      plugins: [
        react(),
        tailwindcss(),
        {
          name: "local-development-csp",
          apply: "serve",
          transformIndexHtml(html) {
            return html.replace(
              "script-src 'self';",
              `script-src 'self' 'nonce-${nonce}';`,
            );
          },
        },
      ],
    },
  };
});

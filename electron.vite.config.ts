import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
import routingConfig from "./tsr.config.json";
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
    main: {
      define: { ...define, __D_PI_DEV__: JSON.stringify(command === "serve") },
      build: {
        externalizeDeps: false,
        rollupOptions: {
          input: {
            index: resolve("src/app/main/index.ts"),
            "session-host": resolve("src/app/host/index.ts"),
          },
        },
      },
    },
    preload: {
      define,
      build: {
        externalizeDeps: false,
        rollupOptions: {
          input: resolve("src/app/preload/index.ts"),
          output: { format: "cjs", entryFileNames: "index.cjs" },
        },
      },
    },
    renderer: {
      root: resolve("src/app/renderer"),
      define,
      resolve: { alias: { "@": resolve("src/app/renderer") } },
      html: command === "serve" ? { cspNonce: nonce } : {},
      build: {
        minify: true,
        rollupOptions: {
          input: { index: resolve("src/app/renderer/index.html") },
        },
      },
      plugins: [
        tanstackRouter({
          ...routingConfig,
          routesDirectory: resolve(routingConfig.routesDirectory),
          generatedRouteTree: resolve(routingConfig.generatedRouteTree),
          quoteStyle: "double",
          target: "react",
          autoCodeSplitting: true,
        }),
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

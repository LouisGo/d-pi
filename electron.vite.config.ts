import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";
export default defineConfig(({ command }) => {
  const nonce = randomUUID();
  return {
    main: { build: { externalizeDeps: false } },
    preload: {
      build: {
        externalizeDeps: false,
        rollupOptions: {
          output: { format: "cjs", entryFileNames: "index.cjs" },
        },
      },
    },
    renderer: {
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

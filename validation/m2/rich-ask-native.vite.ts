import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
export default defineConfig({
  main: {
    build: {
      outDir: resolve("out/rich-ask-native"),
      externalizeDeps: false,
      rollupOptions: {
        input: {
          "rich-ask-native": resolve("validation/m2/rich-ask-native.ts"),
          "session-host": resolve("src/app/host/index.ts"),
          "subagent-worker": resolve("src/app/host/subagent-worker.ts"),
        },
      },
    },
  },
});

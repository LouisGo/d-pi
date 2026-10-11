import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
export default defineConfig({
  main: {
    build: {
      outDir: resolve("out/approval-native"),
      externalizeDeps: false,
      rollupOptions: {
        input: {
          "approval-native": resolve("validation/m2/approval-native.ts"),
          "session-host": resolve("src/app/host/index.ts"),
          "subagent-worker": resolve("src/app/host/subagent-worker.ts"),
        },
      },
    },
  },
});

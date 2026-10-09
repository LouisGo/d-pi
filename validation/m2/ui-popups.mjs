import { spawn } from "node:child_process";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createServer } from "vite";
import { createTestEnvironment } from "../../scripts/testing/test-environment.mjs";

const root = resolve(import.meta.dirname, "../..");
const output = process.argv[2] ? resolve(process.argv[2]) : "";
const sandbox = createTestEnvironment({ prefix: "d-pi-ui-popups-" });
const server = await createServer({
  configFile: false,
  root: resolve(import.meta.dirname, "ui-popups"),
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 0, fs: { allow: [root] } },
});
try {
  await server.listen();
  const child = spawn(
    process.execPath,
    [
      resolve(root, "node_modules/electron/cli.js"),
      resolve(import.meta.dirname, "ui-popups/main.cjs"),
      server.resolvedUrls.local[0],
      output,
    ],
    { cwd: sandbox.cwd, env: sandbox.env, stdio: "inherit" },
  );
  const timer = setTimeout(() => child.kill("SIGTERM"), 60000);
  process.exitCode = await new Promise((done) => {
    child.on("error", () => done(1));
    child.on("exit", (code) => done(code ?? 1));
  });
  clearTimeout(timer);
} finally {
  await server.close();
  sandbox.cleanup();
}

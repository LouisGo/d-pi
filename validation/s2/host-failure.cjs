const { app, utilityProcess } = require("electron");
const { resolve } = require("node:path");
const { randomUUID } = require("node:crypto");
let host;
let failed = false;
const timer = setTimeout(() => {
  console.error("FAIL: failed startup retained its Host");
  host?.kill();
  app.exit(1);
}, 3000);
app.whenReady().then(() => {
  host = utilityProcess.fork(resolve("out/main/session-host.js"));
  host.on("message", (message) => {
    if (message.kind === "failed") failed = true;
  });
  host.on("exit", (code) => {
    clearTimeout(timer);
    if (!failed || code !== 1) {
      console.error("FAIL: startup terminal mismatch");
      app.exit(1);
    } else {
      console.log("PASS: rejected startup releases Host and any native child");
      app.exit(0);
    }
  });
  host.postMessage({
    kind: "start",
    threadId: randomUUID(),
    traceId: randomUUID(),
    processInstanceId: randomUUID(),
    connectionGeneration: randomUUID(),
    configContextId: "fixture",
    binary: resolve("resources/omp/omp"),
    identity: {
      directory: resolve("validation/s2"),
      device: "-1",
      inode: "-1",
    },
    environment: {},
    sessionDirectory: resolve("validation/s2/unused"),
  });
});

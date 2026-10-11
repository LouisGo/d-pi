import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCdpClient } from "./cdp.mjs";

// Controlled input to the owned validation loader, never a generic OS window
// automation API. Production Main/Renderer and OMP execution stay unchanged.
const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root, "Missing owned performance root");
const kind = process.argv[2];
assert(["hide", "show"].includes(kind));
const ready = JSON.parse(
  readFileSync(join(root, "production-probe-ready.json"), "utf8"),
);
const args = execFileSync(
  "ps",
  ["-p", String(ready.applicationPid), "-o", "args="],
  { encoding: "utf8" },
);
assert(
  args.includes(join(root, "out/main/performance-loader.cjs")),
  "Recorded Main is not the owned validation loader",
);
const controlPath = join(root, "production-window-control.json");
const previous = JSON.parse(readFileSync(controlPath, "utf8"));
const nonce = Math.max(Date.now(), previous.nonce + 1);
const socket = new WebSocket(ready.target);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
const { call } = createCdpClient(socket);
try {
  writeFileSync(controlPath, JSON.stringify({ kind, nonce }));
  const deadline = Date.now() + 10000;
  while (true) {
    const result = await call("Runtime.evaluate", {
      expression:
        "({at:Date.now(),state:document.visibilityState,event:window.__productionProbe.visibility.at(-1)??null})",
      returnByValue: true,
    });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    const value = result.result.value;
    if (value.state === (kind === "hide" ? "hidden" : "visible")) {
      const events = readFileSync(
        join(root, "production-window-events.jsonl"),
        "utf8",
      )
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert(
        events.some(
          (event) =>
            event.applicationPid === ready.applicationPid &&
            event.nonce === nonce &&
            event.event === `validation.native-${kind}`,
        ),
        "Window changed without the actual loader accepting this command",
      );
      console.log(
        JSON.stringify({
          kind,
          nonce,
          applicationPid: ready.applicationPid,
          observation: value,
        }),
      );
      break;
    }
    assert(
      Date.now() < deadline,
      "Actual native window lifecycle did not change visibility",
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
} finally {
  socket.close();
}

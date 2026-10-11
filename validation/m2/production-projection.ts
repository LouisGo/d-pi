import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ConversationProjection } from "../../src/modules/conversation/host/public";
import { FrameDecoder } from "../../src/platform/omp/protocol/public";

const root = process.env.D_PI_PERFORMANCE_ROOT;
if (!root) throw Error("Missing owned performance root");
const sdk = join(root, "resources/sdk/node_modules/@oh-my-pi");
const load = (path: string) => import(pathToFileURL(join(sdk, path)).href);
const { setProfile, resolveProfileEnv } = await load("pi-utils/src/index.ts");
setProfile(resolveProfileEnv(process.env.OMP_PROFILE, process.env.PI_PROFILE));
const { ensureTheme } = await load("pi-coding-agent/src/index.ts");
await ensureTheme();
const { createAgentSession } = await load("pi-coding-agent/src/sdk.ts");
const { SessionManager } = await load(
  "pi-coding-agent/src/session/session-manager.ts",
);
const { RpcFrameEncoder } = await load(
  "pi-coding-agent/src/modes/rpc/rpc-frame.ts",
);
const { RpcSessionEventForwarder } = await load(
  "pi-coding-agent/src/modes/rpc/rpc-session-events.ts",
);
const manager = SessionManager.create(
  process.cwd(),
  join(root, "projection-sessions"),
);
const { session } = await createAgentSession({
  sessionManager: manager,
  interactivePrompts: true,
  allowSessionModelFallback: false,
});
const encoder = new RpcFrameEncoder();
encoder.setProtocolVersion(2);
const incoming: Array<{
  type: string;
  serializedFrameBytes: number;
  encodeMs: number;
  decodeWithoutProjectionMs: number;
  projectionMs: number;
}> = [];
const outbound: Array<{
  kind: string;
  bytes: number;
  textBytes: number;
  serializationMs: number;
}> = [];
const projection = new ConversationProjection(randomUUID(), (event) => {
  const start = performance.now();
  const json = JSON.stringify(event);
  const serializationMs = performance.now() - start;
  outbound.push({
    kind: event.kind === "update" ? (event.bodyMode ?? "replace") : event.kind,
    bytes: Buffer.byteLength(json),
    textBytes:
      event.kind === "append"
        ? Buffer.byteLength(event.text) + Buffer.byteLength(event.thinking)
        : 0,
    serializationMs,
  });
});
let projectMs = 0;
const decoder = new FrameDecoder((frame) => {
  const start = performance.now();
  projection.accept(frame);
  projectMs += performance.now() - start;
});
const forwarder = new RpcSessionEventForwarder((event: { type: string }) => {
  const start = performance.now();
  const encoded = encoder.encode(event);
  const encodeMs = performance.now() - start;
  const previous = projectMs;
  const decodeStart = performance.now();
  decoder.push(Buffer.from(encoded));
  const duration = performance.now() - decodeStart;
  const projectionMs = projectMs - previous;
  incoming.push({
    type: event.type,
    serializedFrameBytes: Buffer.byteLength(encoded),
    encodeMs,
    decodeWithoutProjectionMs: Math.max(0, duration - projectionMs),
    projectionMs,
  });
});
const stop = session.subscribe((event: { type: string }) =>
  forwarder.forward(event),
);
try {
  await session.prompt("PERF_PROJECTION_NATIVE_PRODUCER");
  projection.flush();
  decoder.end();
  const updates = incoming.filter((e) => e.type === "message_update");
  assert(
    updates.length >= 500,
    "Actual provider stream did not produce enough native deltas",
  );
  assert(
    outbound.some((e) => e.kind === "snapshot" || e.kind === "append"),
    "Actual projection did not emit body updates",
  );
  const snapshot = projection.snapshot();
  assert(
    snapshot.items.some(
      (item) => item.role === "assistant" && item.state === "complete",
    ),
    "Native generation did not actually complete",
  );
  const summary = {
    source:
      "fixed OMP public AgentSession events + RpcSessionEventForwarder (default full) + RpcFrameEncoder v2 + production FrameDecoder/ConversationProjection",
    method:
      "timing hooks observe a separate real native producer and serialized RPC frames in memory, not OS pipe traffic; this is not the GUI 30-minute timing interval",
    incoming,
    outbound,
    finalProjectionBytes: Buffer.byteLength(JSON.stringify(snapshot)),
    sessionId: manager.getSessionId(),
    sessionFile: manager.getSessionFile(),
    totalNativeBytes: incoming.reduce((s, e) => s + e.serializedFrameBytes, 0),
    totalAppPayloadJsonBytes: outbound.reduce((s, e) => s + e.bytes, 0),
    appendTextBytes: outbound.reduce((s, e) => s + e.textBytes, 0),
    nativeUpdates: updates.length,
  };
  writeFileSync(
    join(root, "native-projection-cost.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(
    JSON.stringify({
      nativeUpdates: summary.nativeUpdates,
      totalNativeBytes: summary.totalNativeBytes,
      totalAppPayloadJsonBytes: summary.totalAppPayloadJsonBytes,
      appendTextBytes: summary.appendTextBytes,
      finalProjectionBytes: summary.finalProjectionBytes,
    }),
  );
} finally {
  stop();
  projection.dispose();
  await session.dispose();
}

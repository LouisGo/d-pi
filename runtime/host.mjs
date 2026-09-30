// App-owned transport adapter. Official SDK modules are loaded unchanged.
import { createInterface } from "node:readline";
import { resolveProfileEnv, setProfile } from "@oh-my-pi/pi-utils";

// Match official CLI bootstrap before SDK imports snapshot configuration paths.
setProfile(resolveProfileEnv(process.env.OMP_PROFILE, process.env.PI_PROFILE));
const { createAgentSession } = await import("@oh-my-pi/pi-coding-agent/sdk");
const { SessionManager } = await import(
  "@oh-my-pi/pi-coding-agent/session/session-manager"
);
const { runRpcMode } = await import(
  "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-mode"
);

import { ConsumptionGate } from "./gate.js";

const { session, setToolUIContext, subagentEventBus } =
  await createAgentSession({
    sessionManager: SessionManager.create(
      process.cwd(),
      process.env.PI_CODING_AGENT_SESSION_DIR,
    ),
  });
if (process.env.D_PI_MODEL_SELECTION) {
  const selection = JSON.parse(process.env.D_PI_MODEL_SELECTION);
  const model = session.modelRegistry.find(
    selection.provider,
    selection.modelId,
  );
  if (!model || !session.modelRegistry.hasConfiguredAuth(model))
    throw Error("Selected model unavailable");
  await session.setModelTemporary(model, selection.thinkingLevel);
}
const gate = new ConsumptionGate();
let paused = false;
let stopping = false;
let closing = false;
let sequence = Promise.resolve();
let stopEpoch = 0;
const encode = new TextEncoder();
const output = (frame) => process.stdout.write(`${JSON.stringify(frame)}\n`);
const state = () => ({
  paused,
  stopping,
  pendingAsync: session.hasPendingAsyncWork(),
  admitted: session.hasAdmittedSubmission,
  streaming: session.isStreaming,
  compacting: session.isCompacting,
  queued: session.queuedMessageCount,
  background: session.getAsyncJobSnapshot()?.running.length ?? 0,
  // Display is bounded independently from the original native queue contents.
  queue: Object.entries(session.getQueuedMessages())
    .flatMap(([kind, texts]) =>
      texts.map((text) => ({ kind, text: text.slice(0, 2048) })),
    )
    .slice(0, 64),
});
session.agent.addBeforeQueuedMessageDequeueHook((signal) => gate.wait(signal));
session.agent.addBeforeModelCallHook((signal) => gate.wait(signal));
let lastState = "";
function publish() {
  const next = JSON.stringify(state());
  if (next !== lastState) {
    lastState = next;
    output({ type: "d_pi_control_state", data: JSON.parse(next) });
  }
}
const timer = setInterval(publish, 200);
timer.unref();
async function control(frame, claimStop, epoch) {
  try {
    if (frame.type === "d_pi_model") {
      if (
        session.isStreaming ||
        session.isCompacting ||
        session.queuedMessageCount ||
        session.hasPendingAsyncWork()
      )
        throw Error("Model change requires idle");
      const model = session.modelRegistry.find(frame.provider, frame.modelId);
      if (!model || !session.modelRegistry.hasConfiguredAuth(model))
        throw Error("Selected model unavailable");
      await session.setModelTemporary(model, frame.thinkingLevel);
      output({
        type: "response",
        command: frame.type,
        id: frame.id,
        success: true,
        data: { model: session.model, thinkingLevel: session.thinkingLevel },
      });
      return;
    } else if (frame.type === "d_pi_stop") {
      // Claim before awaiting anything; subsequent native consumption sees the gate.
      if (claimStop) {
        paused = true;
        stopping = true;
        gate.pause("user-stop");
        publish();
        // Keep the native auto-drain scheduler, but stop it at the native hook.
        await session.abort({ reason: "d-pi 用户停止" });
        stopping = false;
      }
    } else if (frame.type === "d_pi_continue") {
      if (stopping || closing || epoch !== stopEpoch)
        throw Error("Control unavailable");
      paused = false;
      gate.resume("user-stop");
      // Public SDK teardown helper re-arms the native scheduler without adding input.
      await session.runModeExitTeardown(async () => {});
    } else if (frame.type !== "d_pi_state") {
      throw Error("Unsupported control");
    }
    publish();
    output({
      type: "response",
      command: frame.type,
      id: frame.id,
      success: true,
      data: state(),
    });
  } catch {
    output({
      type: "response",
      command: frame.type,
      id: frame.id,
      success: false,
      error: "SDK control failed",
    });
  }
}
const input = new ReadableStream({
  start(controller) {
    const lines = createInterface({
      input: process.stdin,
      crlfDelay: Infinity,
    });
    lines.on("line", (line) => {
      if (Buffer.byteLength(line) > 1048576) {
        process.exitCode = 1;
        lines.close();
        return;
      }
      let frame;
      try {
        frame = JSON.parse(line);
      } catch {
        controller.enqueue(encode.encode(`${line}\n`));
        return;
      }
      if (
        ["d_pi_stop", "d_pi_continue", "d_pi_state", "d_pi_model"].includes(
          frame?.type,
        )
      ) {
        const claimStop = frame.type === "d_pi_stop" && !paused;
        if (frame.type === "d_pi_stop") {
          stopEpoch++;
          paused = true;
          gate.pause("user-stop");
          if (claimStop) stopping = true;
        }
        const epoch = stopEpoch;
        sequence = sequence.then(() => control(frame, claimStop, epoch));
      } else if (
        paused &&
        ["prompt", "steer", "follow_up", "abort_and_prompt"].includes(
          frame?.type,
        )
      ) {
        output({
          type: "response",
          command: frame.type,
          id: frame.id,
          success: false,
          error: "明确继续后才能发送",
        });
      } else {
        controller.enqueue(encode.encode(`${line}\n`));
      }
    });
    lines.on("close", () => {
      closing = true;
      clearInterval(timer);
      controller.close();
    });
  },
});
await runRpcMode(session, setToolUIContext, subagentEventBus, input);

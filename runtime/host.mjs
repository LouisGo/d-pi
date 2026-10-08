// App-owned transport adapter. Official SDK modules are loaded unchanged.

import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { createInterface } from "node:readline";
import { resolveProfileEnv, setProfile } from "@oh-my-pi/pi-utils";

// Match official CLI bootstrap before SDK imports snapshot configuration paths.
setProfile(resolveProfileEnv(process.env.OMP_PROFILE, process.env.PI_PROFILE));
const { createAgentSession } = await import("@oh-my-pi/pi-coding-agent/sdk");
const { SessionManager } = await import(
  "@oh-my-pi/pi-coding-agent/session/session-manager"
);
const { RpcFrameEncoder } = await import(
  "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-frame"
);
const { runRpcMode } = await import(
  "@oh-my-pi/pi-coding-agent/modes/rpc/rpc-mode"
);

import { sendsImageInputOnWire } from "@oh-my-pi/pi-ai/providers/vision-guard";
import {
  isHiddenUserCompanion,
  isUserAuthoredQueuedMessage,
  queueChipText,
} from "@oh-my-pi/pi-coding-agent/session/queued-messages";
import { ConsumptionGate } from "./gate.js";
import { prepareImageInput } from "./image-input.mjs";
import { applyModelSelection } from "./model-selection.mjs";
import { NativeQueueManager } from "./native-queue.mjs";
import { createSubagentConfiguration } from "./native-subagent-configuration.mjs";
import { createReadingSession } from "./reading-session.mjs";

// Explicit App binding only; never resume the latest CLI session or mint a replacement.
async function managedSessionManager() {
  const resume = JSON.parse(process.env.D_PI_RESUME_SESSION ?? "null");
  const directory = process.env.PI_CODING_AGENT_SESSION_DIR;
  if (resume === null) return SessionManager.create(process.cwd(), directory);
  if (
    !resume ||
    typeof resume.sessionFile !== "string" ||
    typeof resume.sessionId !== "string" ||
    !directory
  )
    throw Error("Invalid native resume binding");
  const root = await realpath(directory);
  const file = await realpath(resume.sessionFile);
  const within = relative(root, file);
  if (
    within.startsWith("..") ||
    isAbsolute(within) ||
    file !== resume.sessionFile ||
    !(await lstat(file)).isFile()
  )
    throw Error("Unmanaged native resume binding");
  const handle = await open(file, "r");
  let header;
  try {
    const bytes = Buffer.alloc(65536);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const prefix = bytes.subarray(0, bytesRead);
    const newline = prefix.lastIndexOf(10);
    if (newline < 0) throw Error("Native session header unavailable");
    // OMP can put its fixed-width title slot before the session header.
    for (const line of prefix
      .subarray(0, newline)
      .toString("utf8")
      .split("\n")) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line);
      if (entry.type === "session") {
        header = entry;
        break;
      }
    }
  } finally {
    await handle.close();
  }
  if (
    !header ||
    header.type !== "session" ||
    header.id !== resume.sessionId ||
    typeof header.cwd !== "string" ||
    (await realpath(header.cwd)) !== process.cwd()
  )
    throw Error("Native session header identity conflict");
  const manager = await SessionManager.open(file, directory, undefined, {
    initialCwd: process.cwd(),
    throwIfMissing: true,
    suppressBreadcrumb: true,
  });
  if (
    manager.getSessionId() !== resume.sessionId ||
    manager.getSessionFile() !== file ||
    (await realpath(manager.getCwd())) !== (await realpath(process.cwd()))
  ) {
    await manager.close();
    throw Error("Recovered native session identity conflict");
  }
  return manager;
}
const { session, setToolUIContext, subagentEventBus } =
  await createAgentSession({ sessionManager: await managedSessionManager() });
if (process.env.D_PI_MODEL_SELECTION) {
  const selection = JSON.parse(process.env.D_PI_MODEL_SELECTION);
  await applyModelSelection(session, selection);
}
const gate = new ConsumptionGate();
const queue = new NativeQueueManager(session, {
  gate: new ConsumptionGate(),
  isUserAuthored: isUserAuthoredQueuedMessage,
  isCompanion: isHiddenUserCompanion,
  displayText: queueChipText,
});
const subagents = createSubagentConfiguration(session);
const reading = createReadingSession(session, {
  coldResume: JSON.parse(process.env.D_PI_RESUME_SESSION ?? "null") !== null,
});

let paused = false;
let stopping = false;
let closing = false;
let sequence = Promise.resolve();
let stopEpoch = 0;
const encode = new TextEncoder();
const frameEncoder = new RpcFrameEncoder();
let protocol2 = false;
const output = (frame) => {
  for (const line of frameEncoder.encodeFrames(frame))
    process.stdout.write(line);
};
const state = () => ({
  imageSupport: !!session.model && sendsImageInputOnWire(session.model),
  queueState: queue.snapshot(),
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
    .slice(0, 16)
    .map((item) => ({ ...item, text: item.text.slice(0, 512) })),
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
    if (frame.type === "d_pi_reading_page") {
      if (!protocol2) throw Error("reading-protocol-required");
      if (session.isStreaming || session.isCompacting)
        throw Error("reading-session-busy");
      output({
        type: "response",
        command: frame.type,
        id: frame.id,
        success: true,
        data: reading.page(frame),
      });
      return;
    }
    if (
      frame.type === "d_pi_queue" ||
      frame.type === "d_pi_subagent_config" ||
      frame.type === "d_pi_subagent_state"
    ) {
      const data =
        frame.type === "d_pi_queue"
          ? await queue.execute(frame.command)
          : frame.type === "d_pi_subagent_config"
            ? await subagents.apply(frame.command)
            : await subagents.snapshot();
      publish();
      output({
        type: "response",
        command: frame.type,
        id: frame.id,
        success: true,
        data,
      });
      return;
    }
    if (frame.type === "d_pi_model") {
      if (
        session.isStreaming ||
        session.isCompacting ||
        session.queuedMessageCount ||
        session.hasPendingAsyncWork()
      )
        throw Error("Model change requires idle");
      const actual = await applyModelSelection(session, frame);
      output({
        type: "response",
        command: frame.type,
        id: frame.id,
        success: true,
        data: actual,
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
  } catch (error) {
    const code =
      typeof error?.message === "string" &&
      /^[a-z0-9-]{1,64}$/.test(error.message)
        ? error.message
        : "native-operation-failed";
    output({
      type: "response",
      command: frame.type,
      id: frame.id,
      success: false,
      error: code,
    });
  }
}
const imageTransferLimits = process.env.D_PI_IMAGE_TRANSFER_LIMITS
  ? JSON.parse(process.env.D_PI_IMAGE_TRANSFER_LIMITS)
  : undefined;
let forwarding = Promise.resolve();
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
      // This adapter emits large App pages only during cold seeding, before
      // any prompt admission. Earlier SDK RPC frames are small startup reads.
      if (
        ["prompt", "steer", "follow_up", "abort_and_prompt"].includes(
          frame?.type,
        )
      )
        reading.closeSnapshot();
      if (frame?.type === "negotiate_protocol" && frame.protocolVersion === 2) {
        protocol2 = true;
        frameEncoder.setProtocolVersion(2);
      }
      if (
        [
          "d_pi_reading_page",
          "d_pi_stop",
          "d_pi_continue",
          "d_pi_state",
          "d_pi_model",
          "d_pi_queue",
          "d_pi_subagent_config",
          "d_pi_subagent_state",
        ].includes(frame?.type)
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
          data: { inputRejected: "paused" },
        });
      } else {
        const epoch = stopEpoch;
        forwarding = forwarding.then(async () => {
          if (closing) return;
          const isPrompt = [
            "prompt",
            "steer",
            "follow_up",
            "abort_and_prompt",
          ].includes(frame?.type);
          try {
            const result = isPrompt
              ? await prepareImageInput(
                  frame,
                  process.env.D_PI_CONTENT_DIRECTORY,
                  imageTransferLimits,
                  () => !paused && epoch === stopEpoch,
                )
              : { kind: "forward", frame };
            if (closing) return;
            if (result.kind === "rejected") {
              output({
                type: "response",
                command: frame.type,
                id: frame.id,
                success: false,
                data: { inputRejected: result.reason },
                error: result.reason,
              });
              return;
            }
            controller.enqueue(
              encode.encode(
                `${result.frame === frame ? line : JSON.stringify(result.frame)}\n`,
              ),
            );
          } catch (error) {
            const reason = [
              "content-missing",
              "content-corrupt",
              "transport-too-large",
            ].includes(error.message)
              ? error.message
              : "content-corrupt";
            output({
              type: "response",
              command: frame.type,
              id: frame.id,
              success: false,
              data: { inputRejected: reason },
              error: reason,
            });
          }
        });
      }
    });
    lines.on("close", () => {
      void forwarding.finally(() => {
        closing = true;
        clearInterval(timer);
        controller.close();
      });
    });
  },
});
await runRpcMode(reading.session, {
  setToolUIContext,
  subagentEventBus,
  input,
});

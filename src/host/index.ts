import { isAbsolute, relative } from "node:path";
import { match } from "ts-pattern";
import { z } from "zod";
import { ConversationProjection } from "../features/conversation/projection";
import {
  HostCommandSchema,
  type HostStart,
  type NativeState,
  NativeStateSchema,
} from "../features/runtime/host-contracts";
import type { FrozenSubmission } from "../features/submission/contracts";
import { identifyDirectory } from "../main/runtime-resource";
import { PendingInteractions } from "./interactions";
import { type NativeObservation, NativeSession } from "./native-session";

const parent = process.parentPort;
const LocalPromptCompletionSchema = z.object({
  agentInvoked: z.literal(false),
});
if (!parent) throw Error("SessionHost requires an Electron parent port");
let readingPort: Electron.MessagePortMain | null = null;
let projection: ConversationProjection | null = null;
let native: NativeSession | null = null;
let start: HostStart | null = null;
let state: NativeState | null = null;
let busy = false;
const interactions = new PendingInteractions();
let closing = false;
let starting = false;
const prompts = new Map<
  string,
  {
    value: FrozenSubmission;
    acknowledged: boolean;
    timer: ReturnType<typeof setTimeout>;
    acknowledgementTimer: ReturnType<typeof setTimeout>;
  }
>();
function send(message: unknown): void {
  parent?.postMessage(message);
}
function clearPrompts(): void {
  for (const entry of prompts.values()) {
    clearTimeout(entry.timer);
    clearTimeout(entry.acknowledgementTimer);
  }
  prompts.clear();
}
function observe(event: NativeObservation): void {
  if (event.kind === "disconnected") {
    if (closing) return;
    for (const entry of prompts.values())
      send({
        kind: "submission",
        event: {
          kind: "disconnected",
          submissionId: entry.value.submissionId,
          requestId: entry.value.requestId,
          target: entry.value.target,
        },
      });
    clearPrompts();
    send({ kind: "interrupted", reason: event.reason });
    return;
  }
  const frame = event.frame;
  projection?.accept(frame);
  if (frame.type === "agent_start") busy = true;
  if (frame.type === "agent_end" && frame.isTerminal !== false) {
    busy = false;
    void refresh();
  }
  const hadInteraction = interactions.pending;
  interactions.update(frame);
  if (hadInteraction !== interactions.pending && state)
    send({
      kind: "state",
      state,
      busy,
      pendingInteraction: interactions.pending,
    });
  if (
    frame.type === "response" &&
    typeof frame.id === "string" &&
    frame.command === "prompt"
  ) {
    const entry = prompts.get(frame.id);
    if (entry && typeof frame.success === "boolean") {
      clearTimeout(entry.acknowledgementTimer);
      entry.acknowledged ||= frame.success;
      send({
        kind: "submission",
        event: {
          kind: frame.success ? "ack" : "error",
          submissionId: entry.value.submissionId,
          requestId: entry.value.requestId,
          target: entry.value.target,
        },
      });
      // Official builtins complete in the ACK; they do not emit agent_end.
      // Recheck native state before admitting another submission or idle shutdown.
      if (
        !frame.success ||
        LocalPromptCompletionSchema.safeParse(frame.data).success
      )
        void refresh();
    }
  }
  if (frame.type === "prompt_result" && frame.agentInvoked === false) {
    busy = false;
    void refresh();
  }
  // Reading events go directly to the Renderer port; Main receives supervision only.
}
async function refresh(): Promise<void> {
  try {
    const response = await native?.request("get_state");
    if (response?.success !== true) throw Error("Native state unavailable");
    state = NativeStateSchema.parse(response.data);
    busy =
      state.isStreaming || state.isCompacting || state.queuedMessageCount > 0;
    send({
      kind: "state",
      state,
      pendingInteraction: interactions.pending,
      busy,
    });
  } catch {
    send({ kind: "interrupted", reason: "state-unavailable" });
  }
}
async function launch(value: HostStart): Promise<void> {
  if (starting || native) throw Error("Host already owns an instance");
  starting = true;
  try {
    const identity = await identifyDirectory(value.identity.directory);
    if (
      identity.directory !== value.identity.directory ||
      identity.device !== value.identity.device ||
      identity.inode !== value.identity.inode
    )
      throw Error("Directory changed before spawn");
    start = value;
    projection = new ConversationProjection(
      value.connectionGeneration,
      (event) => {
        try {
          readingPort?.postMessage(event);
        } catch {
          readingPort?.close();
          readingPort = null;
        }
      },
    );
    native = new NativeSession(
      {
        binary: value.binary,
        directory: identity.directory,
        environment: value.environment,
        sessionDirectory: value.sessionDirectory,
      },
      observe,
    );
    await native.start();
    await refresh();
    if (!state?.sessionFile)
      throw Error("Native session reference unavailable");
    const within = relative(value.sessionDirectory, state.sessionFile);
    if (within.startsWith("..") || isAbsolute(within))
      throw Error("Unmanaged native session reference");
    send({
      kind: "ready",
      state,
      processInstanceId: value.processInstanceId,
      connectionGeneration: value.connectionGeneration,
    });
  } finally {
    starting = false;
  }
}
function dispatch(value: FrozenSubmission): void {
  if (prompts.has(value.requestId)) return;
  if (
    !native ||
    !start ||
    !state ||
    !state.model ||
    busy ||
    interactions.pending ||
    value.threadId !== start.threadId ||
    value.target.processInstanceId !== start.processInstanceId ||
    value.target.connectionGeneration !== start.connectionGeneration ||
    value.target.configContextId !== start.configContextId ||
    value.target.nativeSessionRef !== state.sessionFile ||
    prompts.size >= 128
  ) {
    send({
      kind: "submission",
      event: {
        kind: "disconnected",
        submissionId: value.submissionId,
        requestId: value.requestId,
        target: value.target,
      },
    });
    return;
  }
  const timer = setTimeout(() => {
    const entry = prompts.get(value.requestId);
    if (entry && !entry.acknowledged)
      send({
        kind: "submission",
        event: {
          kind: "disconnected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        },
      });
    if (entry) clearTimeout(entry.acknowledgementTimer);
    prompts.delete(value.requestId);
    projection?.accept({ type: "submission_correlation_expired" });
  }, 15 * 60_000);
  const acknowledgementTimer = setTimeout(() => {
    const entry = prompts.get(value.requestId);
    if (entry && !entry.acknowledged)
      send({
        kind: "submission",
        event: {
          kind: "disconnected",
          submissionId: value.submissionId,
          requestId: value.requestId,
          target: value.target,
        },
      });
  }, 30000);
  prompts.set(value.requestId, {
    value,
    acknowledged: false,
    timer,
    acknowledgementTimer,
  });
  busy = true;
  try {
    native.write(
      `${JSON.stringify({ id: value.requestId, type: "prompt", message: value.text })}\n`,
    );
  } catch {
    observe({ kind: "disconnected", reason: "write" });
  }
}
parent.on("message", ({ data, ports }) => {
  const parsed = HostCommandSchema.safeParse(data);
  if (!parsed.success) {
    send({ kind: "failed", code: "invalid-host-command" });
    return;
  }
  void match(parsed.data)
    .with({ kind: "attach" }, () => {
      readingPort?.close();
      readingPort = ports[0] ?? null;
      readingPort?.start();
      if (projection) readingPort?.postMessage(projection.snapshot());
      return Promise.resolve();
    })
    .with({ kind: "start" }, (value) => launch(value))
    .with({ kind: "dispatch" }, ({ value }) => {
      dispatch(value);
      return Promise.resolve();
    })
    .with({ kind: "state" }, () => refresh())
    .with({ kind: "close-idle" }, async () => {
      if (busy || interactions.pending || starting) {
        send({ kind: "failed", code: "active-work" });
        return;
      }
      closing = true;
      await native?.close();
      clearPrompts();
      projection?.dispose();
      readingPort?.close();
      process.exit(0);
    })
    .exhaustive()
    .catch(async () => {
      send({ kind: "failed", code: "runtime-unavailable" });
      if (parsed.data.kind === "start") {
        closing = true;
        await native?.close();
        clearPrompts();
        projection?.dispose();
        readingPort?.close();
        process.exit(1);
      }
    });
});

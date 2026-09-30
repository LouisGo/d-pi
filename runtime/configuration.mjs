// Short-lived desktop adapter over unchanged OMP 18.3.0 config/auth modules.

import { join } from "node:path";
import { createInterface } from "node:readline";
import { getAgentDir, resolveProfileEnv, setProfile } from "@oh-my-pi/pi-utils";

setProfile(resolveProfileEnv(process.env.OMP_PROFILE, process.env.PI_PROFILE));
const { Settings } = await import("@oh-my-pi/pi-coding-agent/config/settings");
const { discoverAuthStorage } = await import("@oh-my-pi/pi-coding-agent/sdk");
const { ModelRegistry } = await import(
  "@oh-my-pi/pi-coding-agent/config/model-registry"
);
const settings = await Settings.loadReadOnly({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
});
const auth = await discoverAuthStorage(getAgentDir(), {
  settings,
  cwd: process.cwd(),
});
let writes = Promise.resolve();
let traceId = null;
const output = (data) => {
  writes = writes.then(
    () =>
      new Promise((resolve, reject) =>
        process.stdout.write(
          `${JSON.stringify({ traceId, message: data })}\n`,
          (error) => (error ? reject(error) : resolve()),
        ),
      ),
  );
  return writes;
};
const abort = new AbortController();
let prompt = null;
let started = false;
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
async function run(frame) {
  if (frame.kind === "snapshot") {
    const registry = new ModelRegistry(
      auth,
      join(getAgentDir(), "models.yml"),
      { settings },
    );
    const available = new Set(
      registry.getAvailable().map((m) => m.provider + "/" + m.id),
    );
    const models = registry.getAll().map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      available: available.has(m.provider + "/" + m.id),
      reason: available.has(m.provider + "/" + m.id)
        ? null
        : registry.hasConfiguredAuth(m)
          ? "disabled"
          : "authentication-required",
      reasoning: m.reasoning,
      input: m.input,
    }));
    output({
      kind: "snapshot",
      directory: getAgentDir(),
      profile: process.env.OMP_PROFILE ?? process.env.PI_PROFILE ?? null,
      models,
      defaultModel: settings.getModelRole("default") ?? null,
      openaiAuthenticated: auth.credentials.hasOAuth("openai-codex"),
      deepseekAuthenticated: Boolean(auth.keys.source("deepseek")),
      catalogError: Boolean(registry.getError?.()),
    });
  } else if (frame.kind === "save-key") {
    // Native normalization + models-endpoint validation precede its atomic write.
    // A rejected key never removes or overwrites the existing credential.
    await auth.oauth.login("deepseek", {
      signal: abort.signal,
      onAuth: () => {},
      onProgress: () => {},
      onPrompt: async () => frame.key,
    });
    await auth.credentials.reload();
    if (!Boolean(auth.keys.source("deepseek")))
      throw Error("save-not-confirmed");
    output({ kind: "done" });
  } else if (frame.kind === "login") {
    const jobId = frame.jobId;
    await auth.oauth.login("openai-codex", {
      signal: abort.signal,
      onAuth: (info) =>
        output({
          kind: "challenge",
          jobId,
          url: info.url,
          instructions: info.instructions ?? "",
        }),
      onProgress: (message) => output({ kind: "progress", jobId, message }),
      onPrompt: (request) =>
        new Promise((resolve, reject) => {
          prompt = { resolve, reject };
          output({
            kind: "prompt",
            jobId,
            message: request.message,
            secret: request.secret === true,
          });
        }),
    });
    output({ kind: "done" });
  }
}
lines.on("line", (line) => {
  if (Buffer.byteLength(line) > 32768) {
    abort.abort();
    lines.close();
    return;
  }
  let frame;
  try {
    frame = JSON.parse(line);
  } catch {
    process.exitCode = 1;
    lines.close();
    return;
  }
  if (frame.kind === "cancel") {
    abort.abort();
    prompt?.reject(Error("cancelled"));
    prompt = null;
    return;
  }
  if (frame.kind === "answer" && prompt) {
    prompt.resolve(frame.value);
    prompt = null;
    return;
  }
  if (started) return;
  started = true;
  traceId = frame.traceId;
  run(frame)
    .catch(() =>
      output({
        kind: "failed",
        code:
          frame.kind === "snapshot"
            ? "configuration-unavailable"
            : "authentication-failed",
      }),
    )
    .finally(async () => {
      await writes;
      auth.close();
      lines.close();
      process.exit();
    });
});
lines.on("close", () => {
  abort.abort();
  prompt?.reject(Error("closed"));
});

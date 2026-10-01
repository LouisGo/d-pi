// Short-lived desktop adapter over unchanged OMP 18.4.6 config/auth modules.

import { createInterface } from "node:readline";
import {
  getAgentDir,
  logger,
  resolveProfileEnv,
  setProfile,
} from "@oh-my-pi/pi-utils";

setProfile(resolveProfileEnv(process.env.OMP_PROFILE, process.env.PI_PROFILE));
let auth;
let settings;
const source = () => ({
  directory: getAgentDir(),
  profile: process.env.OMP_PROFILE ?? process.env.PI_PROFILE ?? null,
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
let interactive = false;
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
async function run(frame) {
  if (frame.kind === "snapshot") {
    logger.setTransports({ console: false, file: false });
    const { readConfigurationSnapshot } = await import(
      "./configuration-readonly.mjs"
    );
    await output(await readConfigurationSnapshot(frame));
    return;
  }
  const { Settings } = await import(
    "@oh-my-pi/pi-coding-agent/config/settings"
  );
  const { discoverAuthStorage, loadEffectiveAuthAccountPolicyConfig } =
    await import("@oh-my-pi/pi-coding-agent/session/auth-broker-config");
  settings = await Settings.loadReadOnly({
    cwd: process.cwd(),
    agentDir: getAgentDir(),
  });
  const policy = await loadEffectiveAuthAccountPolicyConfig({
    settings,
    cwd: process.cwd(),
    agentDir: getAgentDir(),
  });
  auth = await discoverAuthStorage(getAgentDir(), {
    accountPolicies: policy.accountPolicies,
    authStorageOptions: { defaultReservePct: policy.defaultReservePct },
  });
  const identity = {
    scope: frame.scope,
    traceId: frame.traceId,
    source: source(),
  };
  if (frame.kind === "save-key") {
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
    output({ kind: "done", ...identity });
  } else if (frame.kind === "login") {
    const jobId = frame.jobId;
    await auth.oauth.login("openai-codex", {
      signal: abort.signal,
      onAuth: (info) =>
        output({
          ...identity,
          kind: "challenge",
          jobId,
          url: info.url,
          instructions: info.instructions ?? "",
        }),
      onProgress: (message) =>
        output({ ...identity, kind: "progress", jobId, message }),
      onPrompt: (request) =>
        new Promise((resolve, reject) => {
          prompt = { resolve, reject };
          output({
            ...identity,
            kind: "prompt",
            jobId,
            message: request.message,
            secret: request.secret === true,
          });
        }),
    });
    output({ kind: "done", ...identity });
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
  interactive = frame.kind === "login";
  traceId = frame.traceId;
  run(frame)
    .catch(() =>
      output({
        kind: "failed",
        scope: frame.scope,
        traceId: frame.traceId,
        source: source(),
        code:
          frame.kind === "snapshot"
            ? "configuration-unavailable"
            : "authentication-failed",
      }),
    )
    .finally(async () => {
      await writes;
      auth?.close();
      lines.close();
      process.exit();
    });
});
lines.on("close", () => {
  if (!interactive) return;
  abort.abort();
  prompt?.reject(Error("closed"));
});

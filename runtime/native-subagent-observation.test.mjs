import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";

test("fixed SDK RPC observes two same-name tasks, final transcript and terminal registry removal", async () => {
  const requests = [];
  let releaseChildren;
  const released = new Promise((resolve) => {
    releaseChildren = resolve;
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const body = await req.json();
      requests.push(body);
      const index = requests.length;
      const childMessage = body.messages.find(
        (message) =>
          message.role === "user" &&
          JSON.stringify(message.content).includes("M2_SUBAGENT_CHILD_"),
      );
      const chunk = (delta, finish_reason) => ({
        id: "fixture",
        object: "chat.completion.chunk",
        created: 1,
        model: body.model,
        choices: [{ index: 0, delta, finish_reason }],
      });
      let delta = { role: "assistant", content: "M2_SUBAGENT_PARENT_DONE" },
        finish = "stop";
      if (index === 1) {
        delta = {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "native-parent-task",
              type: "function",
              function: {
                name: "task",
                arguments: JSON.stringify({
                  context: "Delegate both tasks explicitly as requested.",
                  tasks: [
                    {
                      name: "first-task",
                      agent: "task",
                      task: "M2_SUBAGENT_CHILD_A reply one result",
                      solutionSpace: "Reply only with text",
                    },
                    {
                      name: "second-task",
                      agent: "task",
                      task: "M2_SUBAGENT_CHILD_B reply one result",
                      solutionSpace: "Reply only with text",
                    },
                  ],
                }),
              },
            },
          ],
        };
        finish = "tool_calls";
      } else if (childMessage) {
        await released;
        const result = JSON.stringify(childMessage.content).includes("CHILD_A")
          ? "M2_SUBAGENT_CHILD_RESULT_A"
          : "M2_SUBAGENT_CHILD_RESULT_B";
        delta = {
          role: "assistant",
          content: result,
          tool_calls: [
            {
              index: 0,
              id: `yield-${index}`,
              type: "function",
              function: {
                name: "yield",
                arguments: JSON.stringify({ data: result }),
              },
            },
          ],
        };
        finish = "tool_calls";
      }
      return new Response(
        `data: ${JSON.stringify(chunk(delta, null))}\n\ndata: ${JSON.stringify(chunk({}, finish))}\n\ndata: [DONE]\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  });
  await writeFile(
    join(process.env.PI_CODING_AGENT_DIR, "models.yml"),
    JSON.stringify({
      providers: {
        fixture: {
          baseUrl: `http://127.0.0.1:${server.port}/v1`,
          apiKey: "fixture",
          api: "openai-completions",
          models: [
            {
              id: "fixture",
              name: "fixture",
              reasoning: false,
              input: ["text"],
              contextWindow: 128000,
              maxTokens: 1024,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    }),
  );
  await writeFile(
    join(process.env.PI_CODING_AGENT_DIR, "config.yml"),
    JSON.stringify({
      autolearn: { enabled: false },
      modelRoles: {
        default: "fixture/fixture",
        smol: "fixture/fixture",
        task: "fixture/fixture",
      },
      task: { batch: true },
      async: { enabled: false },
    }),
  );
  const child = spawn(
    join(import.meta.dir, "../bun"),
    [join(import.meta.dir, "../host.mjs")],
    { cwd: process.cwd(), env: process.env, stdio: ["pipe", "pipe", "pipe"] },
  );
  const frames = [];
  let stderr = "";
  child.stderr.on("data", (bytes) => {
    stderr += bytes;
  });
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => {
    frames.push(JSON.parse(line));
  });
  const wait = async (predicate) => {
    const until = Date.now() + 20000;
    while (!predicate()) {
      if (child.exitCode !== null || Date.now() > until)
        throw Error(
          `SDK exited/timed out ${stderr.slice(-1800)} frames=${JSON.stringify(frames.slice(-4))}`,
        );
      await Bun.sleep(10);
    }
  };
  const request = async (type, payload = {}) => {
    const id = crypto.randomUUID();
    child.stdin.write(JSON.stringify({ type, id, ...payload }) + "\n");
    await wait(() =>
      frames.some((frame) => frame.type === "response" && frame.id === id),
    );
    return frames.find((frame) => frame.type === "response" && frame.id === id);
  };
  try {
    await wait(() => frames.some((frame) => frame.type === "ready"));
    expect(
      (await request("set_subagent_subscription", { level: "events" })).success,
    ).toBe(true);
    expect((await request("get_subagents")).data.subagents).toEqual([]);
    expect(
      (
        await request("prompt", {
          message:
            "M2_SUBAGENT_PARENT: explicitly delegate two tasks to subagents using the task tool.",
        })
      ).success,
    ).toBe(true);
    await wait(
      () =>
        frames.filter(
          (frame) =>
            frame.type === "subagent_lifecycle" &&
            frame.payload.status === "started",
        ).length === 2,
    );
    const active = (await request("get_subagents")).data.subagents;
    expect(active).toHaveLength(2);
    expect(new Set(active.map((run) => run.id)).size).toBe(2);
    expect(
      active.every((run) => run.parentToolCallId === "native-parent-task"),
    ).toBe(true);
    releaseChildren();
    await wait(
      () =>
        frames.filter(
          (frame) =>
            frame.type === "subagent_lifecycle" &&
            frame.payload.status === "completed",
        ).length === 2,
    );
    for (const run of active) {
      const transcript = await request("get_subagent_messages", {
        subagentId: run.id,
      });
      expect(transcript.success).toBe(true);
      expect(transcript.data.sessionFile).toBe(run.sessionFile);
      expect(JSON.stringify(transcript.data.messages)).toContain(
        "M2_SUBAGENT_CHILD_RESULT_",
      );
    }
    expect((await request("get_subagents")).data.subagents).toEqual([]);
    await writeFile(
      process.env.OBSERVATION_EVIDENCE_PATH,
      JSON.stringify(
        {
          sdkVersion: "18.4.6",
          config: { task: { batch: true } },
          supplierCalls: requests.length,
          frames,
        },
        null,
        2,
      ),
    );
  } finally {
    releaseChildren();
    child.kill("SIGKILL");
    lines.close();
    server.stop(true);
  }
}, 30000);

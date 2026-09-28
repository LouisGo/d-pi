import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";
import { managedRuntime } from "../main/runtime-resource";
import { NativeSession } from "./native-session";

it.skipIf(process.env.D_PI_NATIVE_SMOKE !== "1")(
  "official v18.3.0 preserves the native session and context through two real streamed turns",
  async () => {
    const root = mkdtempSync(join(tmpdir(), "d-pi-native-smoke-"));
    const config = join(root, "config");
    const project = join(root, "project");
    mkdirSync(config);
    mkdirSync(project);
    const requests: string[] = [];
    const server = createServer(async (req, res) => {
      let body = "";
      for await (const bytes of req) body += bytes.toString();
      requests.push(body);
      const text =
        requests.length === 1
          ? "FIRST_NATIVE_RESPONSE"
          : "SECOND_NATIVE_RESPONSE";
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const frame = (delta: unknown, finish: string | null) => ({
        id: "fixture",
        object: "chat.completion.chunk",
        created: 1,
        model: "fixture",
        choices: [{ index: 0, delta, finish_reason: finish }],
      });
      res.write(
        `data: ${JSON.stringify(frame({ role: "assistant", content: text }, null))}\n\n`,
      );
      res.write(`data: ${JSON.stringify(frame({}, "stop"))}\n\n`);
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("No fixture port");
    writeFileSync(
      join(config, "models.yml"),
      JSON.stringify({
        providers: {
          fixture: {
            baseUrl: `http://127.0.0.1:${address.port}/v1`,
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
    writeFileSync(
      join(config, "config.yml"),
      JSON.stringify({
        autolearn: { enabled: false },
        modelRoles: { default: "fixture/fixture", smol: "fixture/fixture" },
      }),
    );
    const frames: unknown[] = [];
    let endTurn: (() => void) | null = null;
    const session = new NativeSession(
      {
        binary: await managedRuntime(resolve("resources")),
        directory: project,
        sessionDirectory: join(root, "sessions"),
        environment: {
          PATH: "/usr/bin:/bin",
          HOME: root,
          TMPDIR: tmpdir(),
          PI_CODING_AGENT_DIR: config,
          PI_CONFIG_DIR: ".fixture-no-project-config",
          OPENAI_API_KEY: "fixture",
        },
        extraArgs: [
          "--model",
          "fixture/fixture",
          "--no-extensions",
          "--no-skills",
          "--no-rules",
          "--no-lsp",
          "--no-pty",
        ],
      },
      (event) => {
        if (event.kind === "frame") {
          frames.push(event.frame);
          if (
            event.frame.type === "agent_end" &&
            event.frame.isTerminal !== false
          )
            endTurn?.();
        }
      },
    );
    try {
      await session.start();
      const before = await session.request("get_state");
      for (const message of ["FIRST_USER_INPUT", "SECOND_USER_INPUT"]) {
        const ended = new Promise<void>((accept) => {
          endTurn = accept;
        });
        expect(await session.request("prompt", { message })).toMatchObject({
          success: true,
        });
        await ended;
      }
      const after = await session.request("get_state");
      expect(after).toMatchObject({
        success: true,
        data: expect.objectContaining({
          sessionId: (before.data as { sessionId: string }).sessionId,
        }),
      });
      expect(requests).toHaveLength(2);
      expect(requests[1]).toContain("FIRST_USER_INPUT");
      expect(requests[1]).toContain("FIRST_NATIVE_RESPONSE");
      expect(JSON.stringify(frames)).toContain("SECOND_NATIVE_RESPONSE");
    } finally {
      await session.close();
      server.closeAllConnections();
      await new Promise<void>((accept) => server.close(() => accept()));
      rmSync(root, { recursive: true, force: true });
    }
  },
  60000,
);

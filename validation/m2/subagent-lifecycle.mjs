import assert from "node:assert/strict";

export function createSubagentSupplier() {
  const requests = [];
  const releases = new Map();
  function handle(request, response) {
    const user = request.messages
      .filter((message) => message.role === "user")
      .at(-1);
    const text =
      typeof user?.content === "string"
        ? user.content
        : (user?.content ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");
    const child = ["FIRST", "SECOND"].find((name) =>
      text.includes("M2_SUBAGENT_CHILD_" + name),
    );
    if (!child && !text.includes("M2_SUBAGENT_PARENT")) return false;
    requests.push({ scope: child ?? "PARENT", request });
    const frame = (delta, finish) => ({
      id: "subagent-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: request.model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const write = (delta, finish = null) =>
      response.write(`data: ${JSON.stringify(frame(delta, finish))}\n\n`);
    const finish = (reason = "stop") => {
      write({}, reason);
      response.end("data: [DONE]\n\n");
    };
    if (child) {
      const output = "M2_SUBAGENT_RESULT_" + child;
      write({
        role: "assistant",
        content: `Finished ${child}.`,
        tool_calls: [
          {
            index: 0,
            id: "m2-yield-" + child.toLowerCase(),
            type: "function",
            function: {
              name: "yield",
              arguments: JSON.stringify({
                data: output,
                error: null,
                type: null,
              }),
            },
          },
        ],
      });
      releases.set(child, () => finish("tool_calls"));
    } else if (request.messages.some((message) => message.role === "tool")) {
      write({ role: "assistant", content: "M2_SUBAGENT_PARENT_DONE" });
      finish();
    } else {
      write({
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "m2-lifecycle-task",
            type: "function",
            function: {
              name: "task",
              arguments: JSON.stringify({
                context:
                  "Deterministic local validation only. Return the result with yield; do not use files or network.",
                tasks: ["FIRST", "SECOND"].map((name) => ({
                  name: name.toLowerCase() + "-task",
                  agent: "task",
                  task:
                    "M2_SUBAGENT_CHILD_" +
                    name +
                    ". Reply with the fixture result only.",
                  solutionSpace:
                    "Return the fixture text with yield. No files, network or other tool use.",
                })),
              }),
            },
          },
        ],
      });
      finish("tool_calls");
    }
    return true;
  }
  return { handle, requests, releases };
}

export async function validateSubagentLifecycle({
  supplier,
  db,
  evaluate,
  wait,
  click,
  insert,
  selectThread,
  call,
  shot,
  checks,
  screenshots,
  threadA,
  threadB,
}) {
  await click("新会话");
  const threadId = await wait(() => {
    const id = db
      .prepare("SELECT active_thread FROM desktop")
      .get().active_thread;
    return id !== threadA && id !== threadB ? id : null;
  });
  await wait(() =>
    evaluate(
      "document.querySelector('.runtime-panel')?.textContent.includes('OMP 已就绪')",
    ),
  );
  await insert("M2_SUBAGENT_PARENT");
  await click("发送");
  await wait(() => supplier.releases.size === 2);
  const cards = () =>
    evaluate(
      "[...document.querySelectorAll('[data-subagent-id]')].map(el=>({id:el.dataset.subagentId,status:el.dataset.subagentStatus,text:el.textContent}))",
    );
  await wait(
    async () =>
      (await cards()).filter((card) => card.status === "running").length === 2,
  );
  const running = await cards();
  assert.equal(new Set(running.map((card) => card.id)).size, 2);
  screenshots.push(await shot("m2-subagents-running"));
  await selectThread(threadB);
  assert.equal((await cards()).length, 0);
  await selectThread(threadId);
  await wait(async () => (await cards()).length === 2);
  await call("Page.reload");
  await wait(async () => (await cards()).length === 2);
  assert.equal(
    supplier.requests.length,
    3,
    "reconnect dispatched another parent or child request",
  );
  supplier.releases.get("FIRST")();
  await wait(async () =>
    (await cards()).some(
      (card) =>
        card.status === "completed" &&
        card.text.includes("M2_SUBAGENT_RESULT_FIRST"),
    ),
  );
  assert.ok((await cards()).some((card) => card.status === "running"));
  assert.equal(
    supplier.requests.filter((entry) => entry.scope === "PARENT").length,
    1,
  );
  supplier.releases.get("SECOND")();
  await wait(
    async () =>
      (await cards()).filter((card) => card.status === "completed").length ===
      2,
  );
  await wait(() =>
    evaluate(
      "document.querySelector('.conversation')?.textContent.includes('M2_SUBAGENT_PARENT_DONE')",
    ),
  );
  const completed = await cards();
  assert.ok(
    completed.some((card) => card.text.includes("M2_SUBAGENT_RESULT_FIRST")),
  );
  assert.ok(
    completed.some((card) => card.text.includes("M2_SUBAGENT_RESULT_SECOND")),
  );
  assert.ok(completed.every((card) => !card.text.includes(".jsonl")));
  screenshots.push(await shot("m2-subagents-completed"));
  await evaluate(
    "document.querySelector('button[aria-label=\"切换为浅色主题\"]').click()",
  );
  await click("紧凑密度");
  screenshots.push(await shot("m2-subagents-light-compact"));
  assert.deepEqual(
    (await cards()).map((card) => card.id).sort(),
    running.map((card) => card.id).sort(),
  );
  await evaluate(
    "document.querySelector('button[aria-label=\"切换为深色主题\"]').click()",
  );
  await click("正常密度");
  await call("Page.reload");
  await wait(
    async () =>
      (await cards()).filter((card) => card.status === "completed").length ===
      2,
  );
  assert.equal(supplier.requests.length, 4);
  checks.push(
    "packaged native task launches two independent runs of the same agent; running/completed results survive Thread switches and Renderer reload without execution replay, sibling completion or native session paths",
  );
  await selectThread(threadA);
}

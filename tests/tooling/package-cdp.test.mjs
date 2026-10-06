import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { createCdpClient } from "../../validation/m2/cdp.mjs";
import { ValidationTransportError, wait } from "../../validation/m2/wait.mjs";

test("a real unanswered CDP request keeps its transport cause at the wait deadline", async () => {
  const socket = { readyState: WebSocket.OPEN, send() {} };
  const client = createCdpClient(socket, 20);
  await assert.rejects(
    wait(() => client.call("Runtime.evaluate"), 20, "unanswered evaluation"),
    (error) =>
      error instanceof ValidationTransportError &&
      error.message === "CDP Runtime.evaluate timeout",
  );
});

test("a request responds normally and a closed socket terminates its active wait", async () => {
  const socket = {
    readyState: WebSocket.OPEN,
    send(data) {
      const { id } = JSON.parse(data);
      queueMicrotask(() =>
        socket.onmessage({
          data: JSON.stringify({ id, result: { value: 42 } }),
        }),
      );
    },
  };
  const client = createCdpClient(socket);
  assert.deepEqual(await wait(() => client.call("Runtime.evaluate")), {
    value: 42,
  });
  socket.send = () => queueMicrotask(() => socket.onclose());
  await assert.rejects(
    wait(() => client.call("Runtime.evaluate")),
    (error) =>
      error instanceof ValidationTransportError &&
      error.message === "CDP closed",
  );
});

test("standalone request timeouts and synchronous send failures retain their cause", async () => {
  const socket = { readyState: WebSocket.OPEN, send() {} };
  const client = createCdpClient(socket, 10);
  await assert.rejects(
    client.call("Runtime.evaluate"),
    /CDP Runtime.evaluate timeout/,
  );
  socket.send = () => {
    throw Error("fixture send failure");
  };
  await assert.rejects(
    client.call("Runtime.evaluate"),
    /CDP Runtime.evaluate send failed/,
  );
});

test("cancelling one wait does not cancel another concurrent request", async () => {
  const first = { readyState: WebSocket.OPEN, send() {} };
  const second = {
    readyState: WebSocket.OPEN,
    send(data) {
      const { id } = JSON.parse(data);
      setTimeout(
        () => second.onmessage({ data: JSON.stringify({ id, result: 42 }) }),
        30,
      );
    },
  };
  const [timedOut, completed] = await Promise.allSettled([
    wait(() => createCdpClient(first).call("Runtime.evaluate"), 10),
    wait(() => createCdpClient(second).call("Runtime.evaluate"), 500),
  ]);
  assert.equal(timedOut.status, "rejected");
  assert.ok(timedOut.reason instanceof ValidationTransportError);
  assert.deepEqual(completed, { status: "fulfilled", value: 42 });
});

test("the wait deadline clears the longer CDP timer so its child can exit naturally", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import {createCdpClient} from ${JSON.stringify(new URL("../../validation/m2/cdp.mjs", import.meta.url).href)};
       import {wait,ValidationTransportError} from ${JSON.stringify(new URL("../../validation/m2/wait.mjs", import.meta.url).href)};
       const socket={readyState:WebSocket.OPEN,send(){}};
       try { await wait(()=>createCdpClient(socket,5000).call('Runtime.evaluate'),20); throw Error('unexpected success'); }
       catch(error) { if(!(error instanceof ValidationTransportError)) throw error; }
       console.log('PASS: child exits without a retained request timer');`,
    ],
    { encoding: "utf8", timeout: 1500 },
  );
  assert.equal(result.status, 0, result.error?.message || result.stderr);
  assert.match(result.stdout, /PASS: child exits/);
});

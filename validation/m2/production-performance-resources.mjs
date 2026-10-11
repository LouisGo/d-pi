import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCdpClient } from "./cdp.mjs";

const root = process.env.D_PI_PERFORMANCE_ROOT;
assert(root, "Missing owned performance root");
const label = process.argv[2] ?? "hidden";
assert(/^[a-z-]+$/.test(label));
const ready = JSON.parse(
  readFileSync(join(root, "production-probe-ready.json"), "utf8"),
);
const socket = new WebSocket(ready.target);
await new Promise((resolve) =>
  socket.addEventListener("open", resolve, { once: true }),
);
const { call } = createCdpClient(socket);
try {
  const result = await call("Runtime.evaluate", {
    returnByValue: true,
    expression: `(${function observeResources() {
      const root = document.getElementById("root");
      const key = Object.keys(root).find((key) =>
        key.startsWith("__reactContainer$"),
      );
      if (!key) throw Error("Actual React root missing");
      const initial = root[key];
      const visited = new Set();
      const clients = new Set();
      const models = new Set();
      const components = {};
      function walk(fiber) {
        if (!fiber || visited.has(fiber)) return;
        visited.add(fiber);
        const name = fiber.type?.displayName ?? fiber.type?.name;
        if (name) components[name] = (components[name] ?? 0) + 1;
        const props = fiber.memoizedProps;
        if (props?.client?.getQueryCache) clients.add(props.client);
        if (props?.model?.workbench?.stateStore) models.add(props.model);
        walk(fiber.child);
        walk(fiber.sibling);
      }
      walk(initial.stateNode?.current ?? initial);
      // Matches the production historyCacheBytes payload policy; this is not heap/RSS.
      function bytes(value) {
        if (typeof value === "string") return value.length * 2;
        if (typeof value === "number") return 8;
        if (typeof value === "boolean") return 1;
        if (value == null) return 0;
        if (Array.isArray(value))
          return value.reduce((sum, item) => sum + bytes(item), 0);
        if (typeof value === "object")
          return Object.entries(value).reduce(
            (sum, [key, item]) => sum + key.length * 2 + bytes(item),
            0,
          );
        return 0;
      }
      return {
        at: Date.now(),
        visibility: document.visibilityState,
        visibilityEvents: window.__productionProbe.visibility,
        domNodes: document.querySelectorAll("*").length,
        mountedFibers: visited.size,
        components,
        queries: [...clients].flatMap((client) =>
          client
            .getQueryCache()
            .getAll()
            .map((query) => ({
              key: query.queryKey,
              observers: query.getObserversCount(),
              pages: query.state.data?.pages?.length ?? null,
              payloadPolicyBytes: bytes(query.state.data),
              status: query.state.status,
              fetchStatus: query.state.fetchStatus,
            })),
        ),
        models: [...models].map((model) => ({
          workbench: model.workbench.stateStore.getState(),
          threads: [...model.threads.values()].map((thread) => ({
            threadId: thread.context.threadId,
            readingConsumers: thread.readingConsumers,
            readingConnected: thread.reading?.connected ?? false,
            runtime: thread.runtime?.getSnapshot(),
          })),
        })),
      };
    }.toString()})()`,
  });
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  const observation = {
    ...result.result.value,
    applicationPid: ready.applicationPid,
    sourceRunStartAt: ready.startAt,
  };
  assert(observation.models.length > 0, "Actual AppModel missing");
  assert(observation.queries.length > 0, "Actual QueryClient missing");
  writeFileSync(
    join(root, `production-resources-${label}.json`),
    JSON.stringify(observation, null, 2),
  );
  if (label.startsWith("hidden")) {
    assert.equal(observation.visibility, "hidden");
    assert(
      observation.models.every((model) =>
        model.threads.every(
          (thread) => thread.readingConsumers === 0 && !thread.readingConnected,
        ),
      ),
    );
    assert(
      observation.queries
        .filter((query) => query.key[0] === "saved-native-conversation")
        .every(
          (query) => query.observers === 0 && query.fetchStatus === "idle",
        ),
    );
  }
  console.log(
    JSON.stringify({
      visibility: observation.visibility,
      domNodes: observation.domNodes,
      queries: observation.queries,
      threads: observation.models.flatMap((model) =>
        model.threads.map(({ runtime, ...thread }) => thread),
      ),
    }),
  );
} finally {
  socket.close();
}

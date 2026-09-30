import { createConversationHost } from "../../modules/conversation/host/public";
import { HostTransportCommandSchema } from "../../modules/execution/contracts/public";
import { createSessionHost } from "../../modules/execution/host/public";

type HostPort = {
  start(): void;
  close(): void;
  postMessage(event: unknown): void;
};
type ParentPort = {
  postMessage(message: unknown): void;
  on(
    event: "message",
    listener: (value: { data: unknown; ports: HostPort[] }) => void,
  ): void;
};
const parent = (process as NodeJS.Process & { parentPort?: ParentPort })
  .parentPort;
if (!parent) throw Error("SessionHost requires an Electron parent port");
const scopes = new Map<string, ReturnType<typeof createSessionHost>>();
parent.on("message", ({ data, ports }) => {
  const parsed = HostTransportCommandSchema.safeParse(data);
  if (!parsed.success) return;
  const { scopeId, command } = parsed.data;
  let host = scopes.get(scopeId);
  if (command.kind === "start") {
    if (host || scopeId !== command.processInstanceId) return;
    const conversation = createConversationHost();
    host = createSessionHost(
      (message) => parent.postMessage({ scopeId, message }),
      () => {
        scopes.delete(scopeId);
        parent.postMessage({ scopeId, message: { kind: "scope-closed" } });
      },
      {
        onStart: (value) => conversation.start(value.connectionGeneration),
        onNativeFrame: (frame) => conversation.accept(frame),
        onAttach: (port) => conversation.attach(port),
        onDispose: () => conversation.dispose(),
      },
    );
    scopes.set(scopeId, host);
  }
  if (!host) {
    ports[0]?.close();
    return;
  }
  void host.handle(command, ports[0]);
});

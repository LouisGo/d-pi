import { createConversationHost } from "../../modules/conversation/host/public";
import { HostCommandSchema } from "../../modules/execution/contracts/public";
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
const conversation = createConversationHost();
const host = createSessionHost(
  (message) => parent.postMessage(message),
  (code) => process.exit(code),
  {
    onStart: (value) => conversation.start(value.connectionGeneration),
    onNativeFrame: (frame) => conversation.accept(frame),
    onAttach: (port) => conversation.attach(port),
    onDispose: () => conversation.dispose(),
  },
);
parent.on("message", ({ data, ports }) => {
  const parsed = HostCommandSchema.safeParse(data);
  if (!parsed.success) {
    parent.postMessage({ kind: "failed", code: "invalid-host-command" });
    return;
  }
  void host.handle(parsed.data, ports[0]);
});

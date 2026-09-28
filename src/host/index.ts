import { HostCommandSchema } from "../features/runtime/host-contracts";
import { createSessionHost } from "./session-host";

const parent = process.parentPort;
if (!parent) throw Error("SessionHost requires an Electron parent port");
const host = createSessionHost(
  (message) => parent.postMessage(message),
  (code) => process.exit(code),
);
parent.on("message", ({ data, ports }) => {
  const parsed = HostCommandSchema.safeParse(data);
  if (!parsed.success) {
    parent.postMessage({ kind: "failed", code: "invalid-host-command" });
    return;
  }
  void host.handle(parsed.data, ports[0]);
});

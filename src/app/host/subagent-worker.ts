import { parentPort, workerData } from "node:worker_threads";
import { runNativeSubagentWorker } from "../../modules/execution/host/public";

const port = parentPort;
if (!port) throw Error("Subagent worker requires its owning Host port");
void runNativeSubagentWorker(workerData).then(
  (reply) => {
    port.postMessage(reply);
    port.close();
  },
  () => {
    process.exitCode = 1;
    port.close();
  },
);

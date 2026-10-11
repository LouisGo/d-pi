import { parentPort, workerData } from "node:worker_threads";
import { runNativeHistoryWorker } from "../../modules/conversation/main/public";

const port = parentPort;
if (!port) throw Error("History worker requires its owning Main port");
void runNativeHistoryWorker(workerData).then(
  (reply) => {
    port.postMessage(reply);
    port.close();
  },
  () => {
    process.exitCode = 1;
    port.close();
  },
);

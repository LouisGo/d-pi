import type { NativeRecoveryReason } from "../../contracts/runtime";

/** Only this closed reason crosses execution admission; native payloads and paths stay local. */
export class NativeRecoveryFailure extends Error {
  constructor(readonly reason: NativeRecoveryReason) {
    super(`Native recovery unavailable: ${reason}`);
    this.name = "NativeRecoveryFailure";
  }
}

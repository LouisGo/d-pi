import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  type ProcessIdentity,
  readProcessIdentity,
  terminateManagedGroup,
} from "../../../../platform/node/processes/public";
import { NativeRecoveryFailure } from "../../core/runtime/native-recovery-failure";

const ProcessIdentitySchema = z.strictObject({
  pid: z.number().int().min(2),
  parentPid: z.number().int().positive(),
  groupId: z.number().int().min(2),
  birth: z.string().min(1),
  executable: z.string().min(1),
});
interface LeaseDependencies {
  identify: (pid: number) => Promise<ProcessIdentity | null>;
  exists: (pid: number) => boolean;
  terminate: (identity: ProcessIdentity) => Promise<boolean>;
}
function registeredIdentity(value: unknown): ProcessIdentity {
  try {
    return ProcessIdentitySchema.parse(JSON.parse(String(value)));
  } catch {
    throw new NativeRecoveryFailure("owner-unknown");
  }
}
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(
      error instanceof Error &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
}
const defaults: LeaseDependencies = {
  identify: readProcessIdentity,
  exists: processExists,
  terminate: terminateManagedGroup,
};

/** Supported d-pi writers only: unrelated CLI/editor writes to private data do not participate. */
export class SessionExecutionLease {
  private released = false;
  private constructor(private readonly database: DatabaseSync) {}
  static async acquire(
    directory: string,
    main: ProcessIdentity,
    dependencies: LeaseDependencies = defaults,
  ): Promise<SessionExecutionLease> {
    try {
      return await this.acquireChecked(directory, main, dependencies);
    } catch (error) {
      if (error instanceof NativeRecoveryFailure) throw error;
      throw new NativeRecoveryFailure("lease-unavailable");
    }
  }
  private static async acquireChecked(
    directory: string,
    main: ProcessIdentity,
    dependencies: LeaseDependencies,
  ): Promise<SessionExecutionLease> {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = join(realpathSync(directory), ".d-pi-execution.sqlite");
    const descriptor = openSync(
      file,
      constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const stat = fstatSync(descriptor);
      if (
        !stat.isFile() ||
        stat.uid !== process.getuid?.() ||
        (stat.mode & 0o777) !== 0o600
      )
        throw Error("Session execution lease is not private");
    } finally {
      closeSync(descriptor);
    }
    const database = new DatabaseSync(file);
    try {
      // Never unlink this inode. The OS releases the exclusive lease on Main crash;
      // persisted process identities survive for verified native-group cleanup.
      database.exec(
        "PRAGMA busy_timeout=0; PRAGMA locking_mode=EXCLUSIVE; BEGIN EXCLUSIVE; CREATE TABLE IF NOT EXISTS owner(id INTEGER PRIMARY KEY CHECK(id=1), main TEXT NOT NULL, native TEXT); COMMIT",
      );
    } catch (cause) {
      database.close();
      const occupied =
        cause instanceof Error &&
        "errcode" in cause &&
        (cause.errcode === 5 || cause.errcode === 6);
      throw new NativeRecoveryFailure(
        occupied ? "occupied" : "lease-unavailable",
      );
    }
    try {
      const previous = database
        .prepare("SELECT main,native FROM owner WHERE id=1")
        .get();
      if (previous) {
        const oldMain = registeredIdentity(previous.main);
        let current: ProcessIdentity | null;
        try {
          current = await dependencies.identify(oldMain.pid);
        } catch {
          throw new NativeRecoveryFailure("owner-unknown");
        }
        if (
          current &&
          current.birth === oldMain.birth &&
          current.executable === oldMain.executable
        )
          throw new NativeRecoveryFailure("occupied");
        if (!current && dependencies.exists(oldMain.pid))
          throw new NativeRecoveryFailure("owner-unknown");
        if (previous.native !== null) {
          const native = registeredIdentity(previous.native);
          let stopped = false;
          try {
            stopped =
              native.groupId === native.pid &&
              (await dependencies.terminate(native));
          } catch {
            // Probe/termination failures are not evidence of physical shutdown.
          }
          if (!stopped) throw new NativeRecoveryFailure("shutdown-unconfirmed");
        }
      }
      database
        .prepare("INSERT OR REPLACE INTO owner VALUES(1,?,NULL)")
        .run(JSON.stringify(main));
      return new SessionExecutionLease(database);
    } catch (error) {
      database.close();
      throw error;
    }
  }
  register(native: ProcessIdentity): void {
    if (this.released || native.pid !== native.groupId)
      throw Error("Native registration requires its execution lease");
    this.database
      .prepare("UPDATE owner SET native=? WHERE id=1")
      .run(JSON.stringify(native));
  }
  release(nativeStopped: boolean): boolean {
    if (this.released) return true;
    if (!nativeStopped) return false;
    try {
      this.database.prepare("DELETE FROM owner WHERE id=1").run();
      this.database.close();
      this.released = true;
      return true;
    } catch {
      // Failed metadata cleanup retains ownership until Main exits.
      return false;
    }
  }
}

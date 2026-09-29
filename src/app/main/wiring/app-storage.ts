import { SubmissionRepository } from "../../../modules/execution/main/public";
import { DraftRepository } from "../../../modules/input/main/public";
import { PreferenceRepository } from "../../../modules/preferences/main/public";
import { ThreadRepository } from "../../../modules/workspace/main/public";
import { AppDatabase } from "../../../platform/main/storage/public";

export class StorageNotInitializedError extends Error {
  constructor() {
    super("Storage initialization has not completed");
    this.name = "StorageNotInitializedError";
  }
}

// One writer and one transaction boundary, with business-specific access paths.
export class AppStorage {
  private readonly database: AppDatabase;
  private readonly repositories: {
    threads: ThreadRepository;
    drafts: DraftRepository;
    submissions: SubmissionRepository;
    preferences: PreferenceRepository;
  };
  private initialized = false;
  private closed = false;
  constructor(path: string) {
    this.database = new AppDatabase(path);
    try {
      const threads = new ThreadRepository(this.database);
      const drafts = new DraftRepository(this.database, threads);
      this.repositories = {
        threads,
        drafts,
        submissions: new SubmissionRepository(this.database, drafts),
        preferences: new PreferenceRepository(this.database),
      };
    } catch (error) {
      this.close();
      throw error;
    }
  }
  /**
   * Repositories are reachable only after the startup sequence completed. A
   * partially migrated database (v3 with WAL, no v4/v5 columns, recovery not
   * run) would otherwise answer queries with whatever error the missing
   * column happens to produce, far from the caller who skipped initialize().
   */
  private ready(): AppStorage["repositories"] {
    if (!this.initialized) throw new StorageNotInitializedError();
    return this.repositories;
  }
  get threads(): ThreadRepository {
    return this.ready().threads;
  }
  get drafts(): DraftRepository {
    return this.ready().drafts;
  }
  get submissions(): SubmissionRepository {
    return this.ready().submissions;
  }
  get preferences(): PreferenceRepository {
    return this.ready().preferences;
  }
  /**
   * Complete the application-owned startup sequence once the database has
   * opened at v3 with WAL: recover execution receipts, then finish v4/v5
   * schema work before callers publish services backed by this storage.
   */
  initialize(): void {
    if (this.closed) throw new Error("Storage is closed");
    if (this.initialized) return;
    try {
      // Recovery is an execution-owned business step. It must run after v3
      // and WAL setup, but before v4/v5 migration and service publication.
      this.repositories.submissions.recoverInterruptedSubmissions();
      this.database.completeSchemaMigrations();
      this.initialized = true;
    } catch (error) {
      this.close();
      throw error;
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
  }
}

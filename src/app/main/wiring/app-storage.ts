import { SubmissionRepository } from "../../../modules/execution/main/public";
import { DraftRepository } from "../../../modules/input/main/public";
import { PreferenceRepository } from "../../../modules/preferences/main/public";
import { ThreadRepository } from "../../../modules/workspace/main/public";
import { AppDatabase } from "../../../platform/main/storage/public";
// One writer and one transaction boundary, with business-specific access paths.
export class AppStorage {
  private readonly database: AppDatabase;
  private initialized = false;
  private closed = false;
  readonly threads: ThreadRepository;
  readonly drafts: DraftRepository;
  readonly submissions: SubmissionRepository;
  readonly preferences: PreferenceRepository;
  constructor(path: string) {
    this.database = new AppDatabase(path);
    try {
      this.threads = new ThreadRepository(this.database);
      this.drafts = new DraftRepository(this.database, this.threads);
      this.submissions = new SubmissionRepository(this.database, this.drafts);
      this.preferences = new PreferenceRepository(this.database);
    } catch (error) {
      this.close();
      throw error;
    }
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
      this.submissions.recoverInterruptedSubmissions();
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

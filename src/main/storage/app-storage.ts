import { AppDatabase } from "./database";
import { DraftRepository } from "./drafts";
import { PreferenceRepository } from "./preferences";
import { SubmissionRepository } from "./submissions";
import { ThreadRepository } from "./threads";
// One writer and one transaction boundary, with business-specific access paths.
export class AppStorage {
  private readonly database: AppDatabase;
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
      // Recovery is an execution-owned business step. It must run after v3
      // and WAL setup, but before v4/v5 migration and service publication.
      this.submissions.recoverInterruptedSubmissions();
      this.database.completeSchemaMigrations();
    } catch (error) {
      this.database.close();
      throw error;
    }
  }
  close(): void {
    this.database.close();
  }
}

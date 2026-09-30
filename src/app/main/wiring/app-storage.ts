import { SubmissionRepository } from "../../../modules/execution/main/public";
import { DraftRepository } from "../../../modules/input/main/public";
import { PreferenceRepository } from "../../../modules/preferences/main/public";
import { ThreadRepository } from "../../../modules/workspace/main/public";
import { AppDatabase } from "../../../platform/main/storage/public";

// One writer and one transaction boundary, with business-owned repositories.
export class AppStorage {
  private closed = false;
  private constructor(
    private readonly database: AppDatabase,
    readonly threads: ThreadRepository,
    readonly drafts: DraftRepository,
    readonly submissions: SubmissionRepository,
    readonly preferences: PreferenceRepository,
  ) {}

  static open(path: string): AppStorage {
    const database = new AppDatabase(path);
    try {
      const threads = new ThreadRepository(database);
      const drafts = new DraftRepository(database, threads);
      const submissions = new SubmissionRepository(database, drafts);
      const preferences = new PreferenceRepository(database);
      // Recovery owns receipt normalization and must precede the v4/v5
      // backups. Only a fully recovered and migrated instance is published.
      submissions.recoverInterruptedSubmissions();
      database.completeSchemaMigrations();
      return new AppStorage(
        database,
        threads,
        drafts,
        submissions,
        preferences,
      );
    } catch (error) {
      database.close();
      throw error;
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
  }
}

import { type Preferences, PreferencesSchema } from "../../shared/preferences";
import type { AppDatabase } from "./database";
export class PreferenceRepository {
  constructor(private readonly database: AppDatabase) {}
  private get db() {
    return this.database.connection;
  }
  read(): Preferences {
    return PreferencesSchema.parse(this.preferenceRow());
  }
  private preferenceRow() {
    const row = this.db
      .prepare(
        "SELECT theme,density,send_key AS sendKey FROM desktop WHERE id=1",
      )
      .get();
    return row ? { ...row, sendKey: row.sendKey ?? undefined } : row;
  }
  save(value: Preferences): void {
    this.db
      .prepare("UPDATE desktop SET theme=?,density=?,send_key=? WHERE id=1")
      .run(value.theme, value.density, value.sendKey ?? null);
  }
}

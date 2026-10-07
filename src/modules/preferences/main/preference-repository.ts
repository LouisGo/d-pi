import type { AppDatabase } from "../../../platform/main/storage/public";
import {
  type NotificationPreferences,
  NotificationPreferencesSchema,
  type Preferences,
  PreferencesSchema,
} from "../contracts/public";
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
        "SELECT theme,density,send_key AS sendKey,locale FROM desktop WHERE id=1",
      )
      .get();
    return row ? { ...row, sendKey: row.sendKey ?? undefined } : row;
  }
  save(value: Preferences): void {
    this.db
      .prepare("UPDATE desktop SET theme=?,send_key=? WHERE id=1")
      .run(value.theme, value.sendKey ?? null);
  }
  readNotifications(): NotificationPreferences {
    const row = this.db
      .prepare(
        "SELECT notification_system,notification_completion FROM desktop WHERE id=1",
      )
      .get();
    return NotificationPreferencesSchema.parse({
      system: row?.notification_system === 1,
      completion: row?.notification_completion === 1,
    });
  }
  saveNotifications(value: NotificationPreferences): void {
    this.db
      .prepare(
        "UPDATE desktop SET notification_system=?,notification_completion=? WHERE id=1",
      )
      .run(Number(value.system), Number(value.completion));
  }
  saveLocale(locale: Preferences["locale"]): void {
    this.db.prepare("UPDATE desktop SET locale=? WHERE id=1").run(locale);
  }
}

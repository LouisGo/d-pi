import type { AppDatabase } from "../../../platform/main/storage/public";
import {
  ModelPickerPreferencesSchema,
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
    const picker = this.db
      .prepare("SELECT payload FROM model_picker_preferences WHERE id=1")
      .get();
    const payload = picker?.payload;
    if (picker && typeof payload !== "string")
      throw Error("Invalid model picker preference record");
    const modelPicker =
      typeof payload === "string"
        ? ModelPickerPreferencesSchema.parse(JSON.parse(payload))
        : undefined;
    return row
      ? {
          ...row,
          sendKey: row.sendKey ?? undefined,
          ...(modelPicker ? { modelPicker } : {}),
        }
      : row;
  }
  save(value: Preferences): void {
    const parsed = PreferencesSchema.parse(value);
    this.database.transaction(() => {
      this.db
        .prepare("UPDATE desktop SET theme=?,send_key=? WHERE id=1")
        .run(parsed.theme, parsed.sendKey ?? null);
      if (parsed.modelPicker !== undefined)
        this.db
          .prepare(
            "INSERT INTO model_picker_preferences(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
          )
          .run(JSON.stringify(parsed.modelPicker));
    });
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

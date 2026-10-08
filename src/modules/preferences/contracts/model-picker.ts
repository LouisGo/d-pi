import { z } from "zod";

// Keys are opaque provider/model identities, including temporarily absent models.
const ModelPickerKeySchema = z.string().min(1).max(2048);
const ModelPickerKeysSchema = z.array(ModelPickerKeySchema).max(10_000);

export const ModelPickerPreferencesSchema = z.strictObject({
  favorites: ModelPickerKeysSchema,
  hidden: ModelPickerKeysSchema,
  order: ModelPickerKeysSchema,
});
export type ModelPickerPreferences = z.infer<
  typeof ModelPickerPreferencesSchema
>;

export const ModelPickerPreferenceChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("favorite"),
    key: ModelPickerKeySchema,
    value: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("visibility"),
    key: ModelPickerKeySchema,
    // true makes a model visible; false adds it to hidden.
    value: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("move"),
    key: ModelPickerKeySchema,
    before: ModelPickerKeySchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("order"),
    // The caller supplies the complete device order, retaining other providers.
    keys: ModelPickerKeysSchema,
  }),
]);
export type ModelPickerPreferenceChange = z.infer<
  typeof ModelPickerPreferenceChangeSchema
>;

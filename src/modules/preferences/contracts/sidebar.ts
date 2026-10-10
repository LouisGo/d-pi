import { z } from "zod";

const Id = z.uuid();
const Ids = z
  .array(Id)
  .max(100_000)
  .refine((ids) => new Set(ids).size === ids.length, "Duplicate identity");
export const SidebarItemSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("project"), id: Id }),
  z.strictObject({ kind: z.literal("thread"), id: Id }),
]);
export type SidebarItem = z.infer<typeof SidebarItemSchema>;
export const SidebarPreferencesSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pins: z
    .array(SidebarItemSchema)
    .max(100_000)
    .refine(
      (items) =>
        new Set(items.map((item) => `${item.kind}:${item.id}`)).size ===
        items.length,
      "Duplicate pin",
    ),
  projectOrder: Ids,
  threadOrder: z.record(Id, Ids),
  collapsedProjects: Ids,
  expandedProjects: Ids,
  collapsedSections: z
    .array(z.enum(["pins", "projects"]))
    .max(2)
    .refine(
      (sections) => new Set(sections).size === sections.length,
      "Duplicate section",
    ),
});
export type SidebarPreferences = z.infer<typeof SidebarPreferencesSchema>;
export const SidebarSnapshotSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  value: SidebarPreferencesSchema,
});
export type SidebarSnapshot = z.infer<typeof SidebarSnapshotSchema>;
export const SidebarChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("pin"),
    item: SidebarItemSchema,
    value: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("move-pin"),
    item: SidebarItemSchema,
    before: SidebarItemSchema.nullable(),
  }),
  z.strictObject({
    kind: z.literal("move-project"),
    id: Id,
    before: Id.nullable(),
  }),
  z.strictObject({
    kind: z.literal("move-thread"),
    projectId: Id,
    id: Id,
    before: Id.nullable(),
  }),
  z.strictObject({
    kind: z.literal("collapse-project"),
    id: Id,
    value: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("expand-project"),
    id: Id,
    value: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal("collapse-section"),
    section: z.enum(["pins", "projects"]),
    value: z.boolean(),
  }),
]);
export type SidebarChange = z.infer<typeof SidebarChangeSchema>;

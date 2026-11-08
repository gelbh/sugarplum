import { z } from "zod";
import { normalizeParasiteName } from "../names";
import {
  PARASITE_FIELD_KEYS,
  PARASITE_GROUPS,
  parasiteFieldsSchema,
  type ParasiteFieldKey,
} from "../templates/parasite";

export const IMAGE_ROLES = [
  "adult",
  "egg_oocyst",
  "larva",
  "lifecycle_diagram",
  "lesion",
  "host",
  "other",
] as const;

const capped = (max: number) => z.string().trim().min(1).max(max);
const name = capped(80);
const fieldKey = z.enum(
  PARASITE_FIELD_KEYS as [ParasiteFieldKey, ...ParasiteFieldKey[]],
);

export function datasetKeyFor(canonicalName: string): string {
  return canonicalName
    .toLowerCase()
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const datasetRefSchema = z.strictObject({
  field: fieldKey.nullable().default(null),
  citation: capped(200),
  url: z
    .url()
    .refine((u) => u.startsWith("https://"), "ref URLs must be https"),
  note: capped(200).nullable().default(null),
});

const datasetImageSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  file: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*\.webp$/),
  role: z.enum(IMAGE_ROLES),
  caption: capped(120).nullable().default(null),
  credit: capped(120),
  license: capped(60),
  sourceUrl: z.url(),
  isHero: z.boolean().default(false),
});

const datasetFieldsSchema = z.strictObject({
  ...parasiteFieldsSchema.shape,
  significance: capped(160).nullable().default(null),
  distribution: capped(80).nullable().default(null),
});

export const datasetEntrySchema = z
  .strictObject({
    key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    canonicalName: name,
    commonName: name.nullable().default(null),
    aliases: z.array(name).default([]),
    misspellings: z.array(name).default([]),
    fields: datasetFieldsSchema,
    refs: z.array(datasetRefSchema).min(1),
    images: z.array(datasetImageSchema).default([]),
  })
  .superRefine((e, ctx) => {
    if (normalizeParasiteName(e.canonicalName)?.canonical !== e.canonicalName) {
      ctx.addIssue({
        code: "custom",
        path: ["canonicalName"],
        message: "not canonical",
      });
    }
    if (e.key !== datasetKeyFor(e.canonicalName)) {
      ctx.addIssue({
        code: "custom",
        path: ["key"],
        message: "key must derive from canonicalName",
      });
    }
    if (!e.refs.some((r) => r.field === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["refs"],
        message: "needs an entry-level ref",
      });
    }
    if (e.fields.group === null) {
      ctx.addIssue({
        code: "custom",
        path: ["fields", "group"],
        message: "group is required",
      });
    }
    e.misspellings.forEach((m, i) => {
      if (normalizeParasiteName(m)?.canonical !== e.canonicalName) {
        ctx.addIssue({
          code: "custom",
          path: ["misspellings", i],
          message: `${m} does not normalise to ${e.canonicalName}`,
        });
      }
    });
  });

export const datasetGroupFileSchema = z
  .strictObject({
    group: z.enum(PARASITE_GROUPS),
    entries: z.array(datasetEntrySchema).min(1),
  })
  .superRefine((f, ctx) => {
    f.entries.forEach((e, i) => {
      if (e.fields.group !== f.group) {
        ctx.addIssue({
          code: "custom",
          path: ["entries", i, "fields", "group"],
          message: `expected ${f.group}`,
        });
      }
    });
  });

export const parasiteDatasetSchema = z.strictObject({
  version: z.number().int().min(1),
  entries: z.array(datasetEntrySchema),
});

export type DatasetEntry = z.output<typeof datasetEntrySchema>;
export type DatasetGroupFile = z.output<typeof datasetGroupFileSchema>;
export type ParasiteDataset = z.output<typeof parasiteDatasetSchema>;

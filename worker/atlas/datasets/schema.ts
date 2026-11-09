import { z } from "zod";
import { normalizeParasiteName } from "../names";
import {
  diagnosticTestSchema,
  lifecycleStageSchema,
  PARASITE_GROUPS,
  parasiteFieldsSchema,
  pppDaysSchema,
} from "../templates/parasite";
import { HOST_TERM_KEYS, ORGAN_TERM_KEYS, hostCovers } from "./vocab";

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
const hostList = z.array(z.enum(HOST_TERM_KEYS)).default([]);

export function datasetKeyFor(canonicalName: string): string {
  return canonicalName
    .toLowerCase()
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const datasetStageSchema = z
  .strictObject({
    ...lifecycleStageSchema.shape,
    host: z.enum(HOST_TERM_KEYS).nullable().default(null),
    durationDays: pppDaysSchema.strict().nullable().default(null),
  })
  .refine((s) => s.durationDays === null || s.hostRole !== null, {
    path: ["durationDays"],
    message: "durationDays needs a hostRole",
  })
  .refine(
    (s) =>
      s.host === null || (s.hostRole !== null && s.hostRole !== "environment"),
    { path: ["host"], message: "host needs a host-bearing hostRole" },
  );

const ROLE_HOSTS = {
  definitive: "definitiveHosts",
  intermediate: "intermediateHosts",
  paratenic: "paratenicHosts",
} as const;

// Learner edits keep the loose template schema; the dataset rejects unknown
// keys at every level and allows only vocabulary terms for hosts and organs.
const datasetFieldsSchema = z.strictObject({
  ...parasiteFieldsSchema.shape,
  group: z.enum(PARASITE_GROUPS),
  definitiveHosts: hostList,
  intermediateHosts: hostList,
  paratenicHosts: hostList,
  majorOrgan: z.enum(ORGAN_TERM_KEYS).nullable().default(null),
  significance: capped(160).nullable().default(null),
  distribution: capped(80).nullable().default(null),
  pppDays: pppDaysSchema.strict().nullable().default(null),
  lifecycleStages: z.array(datasetStageSchema).default([]),
  diagnosticTests: z.array(diagnosticTestSchema.strict()).default([]),
});

const datasetRefSchema = z.strictObject({
  field: datasetFieldsSchema.keyof().nullable().default(null),
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
  sourceUrl: z
    .url()
    .refine((u) => u.startsWith("https://"), "image URLs must be https"),
  isHero: z.boolean().default(false),
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
    const imageIds = new Set(e.images.map((img) => img.id));
    if (imageIds.size !== e.images.length) {
      ctx.addIssue({
        code: "custom",
        path: ["images"],
        message: "image ids must be unique on the entry",
      });
    }
    if (e.images.filter((img) => img.isHero).length > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["images"],
        message: "at most one hero image",
      });
    }
    let diagnosticCount = 0;
    e.fields.lifecycleStages.forEach((stage, i) => {
      const path = ["fields", "lifecycleStages", i];
      if (stage.diagnostic) diagnosticCount += 1;
      if (stage.imageId !== null && !imageIds.has(stage.imageId)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "imageId"],
          message: `${stage.imageId} is not an image on this entry`,
        });
      }
      const needsStageRef =
        stage.infective ||
        stage.durationDays !== null ||
        stage.transmission !== null;
      if (needsStageRef && !e.refs.some((r) => r.field === "lifecycleStages")) {
        ctx.addIssue({
          code: "custom",
          path: [...path],
          message:
            "infective, durationDays, or transmission needs a lifecycleStages ref",
        });
      }
      if (stage.hostRole === null || stage.hostRole === "environment") return;
      const hosts = e.fields[ROLE_HOSTS[stage.hostRole]];
      if (hosts.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "hostRole"],
          message: `no ${ROLE_HOSTS[stage.hostRole]} for this role`,
        });
      } else if (
        stage.host !== null &&
        !hosts.some((h) => hostCovers(h, stage.host!))
      ) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "host"],
          message: `${stage.host} is not in ${ROLE_HOSTS[stage.hostRole]}`,
        });
      }
    });
    if (diagnosticCount > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["fields", "lifecycleStages"],
        message: "at most one diagnostic stage",
      });
    }
    if (!e.refs.some((r) => r.field === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["refs"],
        message: "needs an entry-level ref",
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

const entryNames = (e: DatasetEntry) =>
  new Set(
    [e.canonicalName, e.commonName, ...e.aliases, ...e.misspellings]
      .filter((n): n is string => n !== null)
      .map((n) => n.toLowerCase()),
  );

// Takes the group files so each entry is validated once, then flattens them.
export const parasiteDatasetSchema = z
  .strictObject({
    version: z.number().int().min(1),
    groups: z.array(datasetGroupFileSchema),
  })
  .superRefine((d, ctx) => {
    const keyOwner = new Set<string>();
    const nameOwner = new Map<string, string>();
    d.groups.forEach((g, gi) =>
      g.entries.forEach((e, ei) => {
        const path = ["groups", gi, "entries", ei];
        if (keyOwner.has(e.key)) {
          ctx.addIssue({
            code: "custom",
            path: [...path, "key"],
            message: `duplicate key ${e.key}`,
          });
        }
        keyOwner.add(e.key);
        for (const n of entryNames(e)) {
          const owner = nameOwner.get(n);
          if (owner !== undefined && owner !== e.key) {
            ctx.addIssue({
              code: "custom",
              path,
              message: `${n} is used by ${owner} and ${e.key}`,
            });
          }
          nameOwner.set(n, e.key);
        }
      }),
    );
  })
  .transform(({ version, groups }) => ({
    version,
    entries: groups.flatMap((g) => g.entries),
  }));

export type DatasetEntry = z.output<typeof datasetEntrySchema>;
export type DatasetGroupFile = z.output<typeof datasetGroupFileSchema>;
export type ParasiteDataset = z.output<typeof parasiteDatasetSchema>;

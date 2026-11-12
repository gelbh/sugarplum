import { z } from "zod";
import {
  CLIMATE_BAND_TERM_KEYS,
  DISTRIBUTION_REGION_TERM_KEYS,
} from "../datasets/vocab";

export const PARASITE_GROUPS = [
  "protozoan",
  "nematode",
  "cestode",
  "trematode",
  "arthropod",
] as const;

export const ZOONOTIC_VALUES = ["yes", "no", "potential"] as const;

const text = z.string().trim().min(1);
const optionalText = text.nullable().default(null);
const textList = z.array(text).default([]);
const week = z.number().min(0).nullable().default(null);
const regionList = z.array(z.enum(DISTRIBUTION_REGION_TERM_KEYS)).default([]);
const climateList = z.array(z.enum(CLIMATE_BAND_TERM_KEYS)).default([]);

export const diagnosticTestSchema = z
  .object({
    name: text,
    sample: optionalText,
    windowStartWeek: week,
    windowEndWeek: week,
  })
  .refine(
    (t) =>
      t.windowStartWeek === null ||
      t.windowEndWeek === null ||
      t.windowEndWeek >= t.windowStartWeek,
    { message: "windowEndWeek must not be before windowStartWeek" },
  );

export const pppDaysSchema = z
  .object({
    min: z.number().int().min(0),
    max: z.number().int().min(0),
  })
  .refine((p) => p.max >= p.min, { message: "max must be >= min" });

export const STAGE_HOST_ROLES = [
  "definitive",
  "intermediate",
  "paratenic",
  "environment",
] as const;

export const lifecycleStageSchema = z.object({
  name: text,
  location: optionalText,
  hostRole: z.enum(STAGE_HOST_ROLES).nullable().default(null),
  host: optionalText,
  durationDays: pppDaysSchema.nullable().default(null),
  infective: z.boolean().default(false),
  diagnostic: z.boolean().default(false),
  transmission: optionalText,
  note: optionalText,
  imageId: optionalText,
});

export const parasiteFieldsSchema = z.object({
  phylum: optionalText,
  order: optionalText,
  family: optionalText,
  group: z.enum(PARASITE_GROUPS).nullable().default(null),
  definitiveHosts: textList,
  intermediateHosts: textList,
  paratenicHosts: textList,
  vectorRole: optionalText,
  majorOrgan: optionalText,
  onHostStages: textList,
  distribution: optionalText,
  distributionWorldwide: z.boolean().default(false),
  distributionRegions: regionList,
  climateBands: climateList,
  zoonotic: z.enum(ZOONOTIC_VALUES).nullable().default(null),
  significance: optionalText,
  lifecycleType: z.enum(["direct", "indirect"]).nullable().default(null),
  pppDays: pppDaysSchema.nullable().default(null),
  lifecycleStages: z.array(lifecycleStageSchema).default([]),
  diagnosticStage: optionalText,
  diagnosticTests: z.array(diagnosticTestSchema).default([]),
});

export type ParasiteFields = z.output<typeof parasiteFieldsSchema>;
export type ParasiteFieldKey = keyof ParasiteFields;

export const PARASITE_FIELD_KEYS = Object.keys(
  parasiteFieldsSchema.shape,
) as ParasiteFieldKey[];

export function emptyParasiteFields(): ParasiteFields {
  return parasiteFieldsSchema.parse({});
}

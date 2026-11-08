import { z } from "zod";

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

const lifecycleStageSchema = z.object({
  name: text,
  location: optionalText,
});

const diagnosticTestSchema = z
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

const pppDaysSchema = z
  .object({
    min: z.number().int().min(0),
    max: z.number().int().min(0),
  })
  .refine((p) => p.max >= p.min, { message: "pppDays.max must be >= min" });

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

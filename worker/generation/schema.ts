import { z } from "zod";

/** Anki-style cloze: {{c1::answer}} or {{c2::answer::hint}} */
const ANKI_CLOZE_RE = /\{\{c\d+::[\s\S]*?\}\}/g;
/** Underscore blank markers (3+). */
const UNDERSCORE_BLANK_RE = /_{3,}/g;

const CLOZE_BLANK_MAX = 8;

/**
 * Cloze fronts need 1–8 blanks (Anki `{{cN::…}}` or `___`).
 */
export function assertClozeFront(front: string): void {
  const anki = front.match(ANKI_CLOZE_RE) ?? [];
  const underscores = front.match(UNDERSCORE_BLANK_RE) ?? [];
  const total = anki.length + underscores.length;
  if (total < 1) {
    throw new Error("Cloze cards need at least one blank");
  }
  if (total > CLOZE_BLANK_MAX) {
    throw new Error(`Cloze cards allow at most ${CLOZE_BLANK_MAX} blanks`);
  }
}

/** @deprecated Prefer assertClozeFront */
export const assertSingleCloze = assertClozeFront;

/**
 * MCQ: 3–5 unique trimmed non-empty options; back must match one option.
 * Returns trimmed fields so persist/grade use the same exact strings.
 */
export function assertValidMcqOptions(
  back: string,
  options: string[] | undefined,
): { back: string; options: string[] } {
  if (options === undefined) {
    throw new Error("MCQ requires options");
  }
  const trimmed = options.map((o) => o.trim());
  if (trimmed.length < 3 || trimmed.length > 5) {
    throw new Error("MCQ must have 3–5 options");
  }
  if (trimmed.some((o) => o.length === 0)) {
    throw new Error("MCQ options must be non-empty");
  }
  const seen = new Set<string>();
  for (const o of trimmed) {
    if (seen.has(o)) {
      throw new Error("MCQ options must be unique");
    }
    seen.add(o);
  }
  const answer = back.trim();
  if (!trimmed.includes(answer)) {
    throw new Error("MCQ back must be one of the options");
  }
  return { back: answer, options: trimmed };
}

/** Material page provenance; optional Atlas Make cards fields when present. */
export const ProvenanceSchema = z.object({
  pages: z.array(z.number().int().positive()),
  excerpt: z.string(),
  atlasEntryId: z.string().min(1).optional(),
  citations: z.array(z.string()).optional(),
});

const OcclusionRegionSchema = z
  .object({
    id: z.string().min(1),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
    label: z.string().min(1),
  })
  .superRefine((region, ctx) => {
    if (region.x + region.w > 1) {
      ctx.addIssue({
        code: "custom",
        message: "Region must stay within image bounds (x + w <= 1)",
        path: ["w"],
      });
    }
    if (region.y + region.h > 1) {
      ctx.addIssue({
        code: "custom",
        message: "Region must stay within image bounds (y + h <= 1)",
        path: ["h"],
      });
    }
  });

export const OcclusionFrontSchema = z.object({
  image_key: z.string().min(1),
  prompt: z.string().optional(),
  regions: z.array(OcclusionRegionSchema).min(1).max(8),
  mode: z.literal("hide_one"),
});

export type OcclusionFront = z.infer<typeof OcclusionFrontSchema>;

const TextCardDraftSchema = z
  .object({
    type: z.enum(["qa", "cloze", "image_label", "diagram", "mcq"]),
    front: z.string().min(1),
    /** Cloze Extra may be ""; other text types require min(1) via refine. */
    back: z.string(),
    options: z.array(z.string()).optional(),
    provenance: ProvenanceSchema,
  })
  .superRefine((draft, ctx) => {
    if (draft.type !== "cloze" && draft.back.length < 1) {
      ctx.addIssue({
        code: "custom",
        message: "Back must be non-empty",
        path: ["back"],
      });
    }
    if (draft.type === "cloze") {
      try {
        assertSingleCloze(draft.front);
      } catch (err) {
        ctx.addIssue({
          code: "custom",
          message: err instanceof Error ? err.message : "Invalid cloze",
          path: ["front"],
        });
      }
    }
    if (draft.type === "mcq") {
      try {
        assertValidMcqOptions(draft.back, draft.options);
      } catch (err) {
        ctx.addIssue({
          code: "custom",
          message: err instanceof Error ? err.message : "Invalid MCQ",
          path: ["options"],
        });
      }
    }
  });

const OcclusionCardDraftSchema = z.object({
  type: z.literal("occlusion"),
  front: OcclusionFrontSchema,
  back: z.object({
    answer: z.string().min(1),
  }),
  provenance: ProvenanceSchema,
  media_keys: z.array(z.string().min(1)).optional(),
});

/** Discriminated by `type`: string front/back for text cards; structured for occlusion. */
export const CardDraftSchema = z.union([
  TextCardDraftSchema,
  OcclusionCardDraftSchema,
]);

export type CardDraft = z.infer<typeof CardDraftSchema>;

export const CardDraftListSchema = z.array(CardDraftSchema).min(1);

/**
 * Parse LLM draft cards. Invalid items (e.g. multi-blank cloze) are skipped;
 * throws only when nothing valid remains. Matches critique survivor filtering.
 */
export function parseCardDrafts(raw: unknown): CardDraft[] {
  if (!Array.isArray(raw)) {
    throw new Error("LLM cards must be an array");
  }
  const drafts: CardDraft[] = [];
  for (const item of raw) {
    const result = CardDraftSchema.safeParse(item);
    if (result.success) drafts.push(result.data);
  }
  if (drafts.length === 0) {
    throw new Error("No schema-valid cards in LLM output");
  }
  return drafts;
}

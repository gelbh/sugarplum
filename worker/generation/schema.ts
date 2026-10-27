import { z } from "zod";

/** Anki-style cloze: {{c1::answer}} or {{c2::answer::hint}} */
const ANKI_CLOZE_RE = /\{\{c\d+::[\s\S]*?\}\}/g;
/** Underscore blank markers (3+). */
const UNDERSCORE_BLANK_RE = /_{3,}/g;

/**
 * Cloze fronts may have at most one blank (Anki `{{cN::…}}` or `___`).
 * Throws when more than one blank marker is present.
 */
export function assertSingleCloze(front: string): void {
  const anki = front.match(ANKI_CLOZE_RE) ?? [];
  const underscores = front.match(UNDERSCORE_BLANK_RE) ?? [];
  const total = anki.length + underscores.length;
  if (total > 1) {
    throw new Error("Cloze cards must contain at most one blank");
  }
}

/** MCQ: 3–5 unique trimmed non-empty options; back must match one option exactly (trimmed). */
export function assertValidMcqOptions(back: string, options: string[] | undefined): void {
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
  if (!trimmed.includes(back.trim())) {
    throw new Error("MCQ back must be one of the options");
  }
}

export const ProvenanceSchema = z.object({
  pages: z.array(z.number().int().positive()),
  excerpt: z.string(),
});

export const CardDraftSchema = z
  .object({
    type: z.enum(["qa", "cloze", "image_label", "diagram", "mcq"]),
    front: z.string().min(1),
    back: z.string().min(1),
    options: z.array(z.string()).optional(),
    provenance: ProvenanceSchema,
  })
  .superRefine((draft, ctx) => {
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

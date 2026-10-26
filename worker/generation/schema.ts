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

export const ProvenanceSchema = z.object({
  pages: z.array(z.number().int().positive()),
  excerpt: z.string(),
});

export const CardDraftSchema = z
  .object({
    type: z.enum(["qa", "cloze", "image_label", "diagram"]),
    front: z.string().min(1),
    back: z.string().min(1),
    provenance: ProvenanceSchema,
  })
  .superRefine((draft, ctx) => {
    if (draft.type !== "cloze") return;
    try {
      assertSingleCloze(draft.front);
    } catch (err) {
      ctx.addIssue({
        code: "custom",
        message: err instanceof Error ? err.message : "Invalid cloze",
        path: ["front"],
      });
    }
  });

export type CardDraft = z.infer<typeof CardDraftSchema>;

export const CardDraftListSchema = z.array(CardDraftSchema).min(1);

/** Parse and validate LLM draft output; cloze blanks enforced. */
export function parseCardDrafts(raw: unknown): CardDraft[] {
  return CardDraftListSchema.parse(raw);
}

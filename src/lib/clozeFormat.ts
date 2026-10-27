/** Anki-style cloze: {{c1::answer}} or {{c2::answer::hint}} */
const ANKI_CLOZE_RE = /\{\{c\d+::([\s\S]*?)(?:::(.*?))?\}\}/g;

const ANKI_CLOZE_ONCE_RE = /\{\{c\d+::([\s\S]*?)(?:::(.*?))?\}\}/;

/** Count blanks the same way as worker assertSingleCloze. */
const ANKI_CLOZE_COUNT_RE = /\{\{c\d+::[\s\S]*?\}\}/g;
const UNDERSCORE_BLANK_RE = /_{3,}/g;

/**
 * Cloze fronts may have at most one blank (Anki `{{cN::…}}` or `___`).
 * Mirrors worker/generation/schema assertSingleCloze for guest hub ops.
 */
export function assertSingleCloze(front: string): void {
  const anki = front.match(ANKI_CLOZE_COUNT_RE) ?? [];
  const underscores = front.match(UNDERSCORE_BLANK_RE) ?? [];
  const total = anki.length + underscores.length;
  if (total > 1) {
    throw new Error("Cloze cards must contain at most one blank");
  }
}

export function blankClozeFront(front: string): string {
  return front.replace(ANKI_CLOZE_RE, (_match, _answer: string, hint?: string) => {
    if (hint !== undefined && hint.length > 0) {
      return hint;
    }
    return "[…]";
  });
}

export function revealClozeFront(front: string): string {
  return front.replace(ANKI_CLOZE_RE, (_match, answer: string) => answer);
}

export function extractClozeAnswer(front: string): string | null {
  const match = ANKI_CLOZE_ONCE_RE.exec(front);
  if (!match) return null;
  return match[1] ?? null;
}

/** Extra subtitle on the study answer face; null when unused. */
export function clozeExtraSubtitle(back: string): string | null {
  const trimmed = back.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Draft editor label for cloze back (Anki Extra). */
export const CLOZE_EXTRA_LABEL = "Extra (optional)";

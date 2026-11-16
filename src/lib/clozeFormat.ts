/** Anki-style cloze: {{c1::answer}} or {{c2::answer::hint}} */
const ANKI_CLOZE_RE = /\{\{c\d+::([\s\S]*?)(?:::(.*?))?\}\}/g;

const ANKI_CLOZE_ONCE_RE = /\{\{c\d+::([\s\S]*?)(?:::(.*?))?\}\}/;

/** Count blanks the same way as worker assertClozeFront. */
const ANKI_CLOZE_COUNT_RE = /\{\{c\d+::[\s\S]*?\}\}/g;
const UNDERSCORE_BLANK_RE = /_{3,}/g;

export const CLOZE_BLANK_MAX = 8;

export type ClozePart =
  | { kind: "text"; value: string }
  | { kind: "hint"; value: string }
  | { kind: "blank" };

/**
 * Cloze fronts need 1–CLOZE_BLANK_MAX blanks (Anki `{{cN::…}}` or `___`).
 * Mirrors worker/generation/schema assertClozeFront for guest hub ops.
 */
export function assertClozeFront(front: string): void {
  const anki = front.match(ANKI_CLOZE_COUNT_RE) ?? [];
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

export function clozeParts(front: string): ClozePart[] {
  const parts: ClozePart[] = [];
  const re = new RegExp(ANKI_CLOZE_RE.source, "g");
  let cursor = 0;
  for (const match of front.matchAll(re)) {
    const index = match.index ?? cursor;
    if (index > cursor) {
      parts.push({ kind: "text", value: front.slice(cursor, index) });
    }
    const hint = match[2];
    if (hint !== undefined && hint.length > 0) {
      parts.push({ kind: "hint", value: hint });
    } else {
      parts.push({ kind: "blank" });
    }
    cursor = index + match[0].length;
  }
  if (cursor < front.length) {
    parts.push({ kind: "text", value: front.slice(cursor) });
  }
  return parts;
}

export function clozeSpoken(front: string): string {
  return clozeParts(front)
    .map((part) => {
      if (part.kind === "blank") return "blank";
      return part.value;
    })
    .join("");
}

export function blankClozeFront(front: string): string {
  return clozeParts(front)
    .map((part) => {
      if (part.kind === "blank") return "[…]";
      return part.value;
    })
    .join("");
}

export function revealClozeFront(front: string): string {
  return front.replace(ANKI_CLOZE_RE, (_match, answer: string) => answer);
}

export function extractClozeAnswer(front: string): string | null {
  const match = ANKI_CLOZE_ONCE_RE.exec(front);
  if (!match) return null;
  return match[1] ?? null;
}

/** All Anki cloze answers in order (study back face). */
export function extractClozeAnswers(front: string): string[] {
  const re = new RegExp(ANKI_CLOZE_RE.source, "g");
  const answers: string[] = [];
  for (const match of front.matchAll(re)) {
    const answer = match[1]?.trim();
    if (answer) answers.push(answer);
  }
  return answers;
}

/** Extra subtitle on the study answer face; null when unused. */
export function clozeExtraSubtitle(back: string): string | null {
  const trimmed = back.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Draft editor label for cloze back (Anki Extra). */
export const CLOZE_EXTRA_LABEL = "Extra (optional)";

export type ComposeClozeResult =
  { ok: true; front: string } | { ok: false; error: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Index of `blank` in `sentence`. Alphanumeric blanks must be whole tokens so
 * typing "P" does not wrap the P inside "Paris".
 */
export function findClozeBlankIndex(sentence: string, blank: string): number {
  if (!blank) return -1;
  if (/^[\p{L}\p{N}]+$/u.test(blank)) {
    const re = new RegExp(
      `(?<![\\p{L}\\p{N}])${escapeRegExp(blank)}(?![\\p{L}\\p{N}])`,
      "u",
    );
    const match = re.exec(sentence);
    return match?.index ?? -1;
  }
  return sentence.indexOf(blank);
}

/**
 * Wrap one or more blanks in `sentence` as `{{c1::…}}`, `{{c2::…}}`, …
 * Blanks are matched left-to-right without overlapping.
 */
export function composeClozeFront(
  sentence: string,
  blankOrBlanks: string | string[],
): ComposeClozeResult {
  const blanks = (
    Array.isArray(blankOrBlanks) ? blankOrBlanks : [blankOrBlanks]
  )
    .map((b) => b.trim())
    .filter(Boolean);

  if (!sentence.trim()) {
    return { ok: false, error: "Sentence is required" };
  }
  if (blanks.length === 0) {
    return { ok: false, error: "Add at least one blank" };
  }
  if (blanks.length > CLOZE_BLANK_MAX) {
    return {
      ok: false,
      error: `At most ${CLOZE_BLANK_MAX} blanks`,
    };
  }

  type Hit = { index: number; length: number; text: string; n: number };
  const hits: Hit[] = [];
  let searchFrom = 0;
  for (let i = 0; i < blanks.length; i++) {
    const blank = blanks[i]!;
    if (blank.includes("}}") || blank.includes("::")) {
      return { ok: false, error: "Blank cannot contain :: or }}" };
    }
    const local = findClozeBlankIndex(sentence.slice(searchFrom), blank);
    if (local < 0) {
      return {
        ok: false,
        error:
          blanks.length === 1
            ? "Put the blank text inside the sentence."
            : `Put “${blank}” inside the sentence.`,
      };
    }
    const index = searchFrom + local;
    hits.push({ index, length: blank.length, text: blank, n: i + 1 });
    searchFrom = index + blank.length;
  }

  let front = sentence;
  for (let i = hits.length - 1; i >= 0; i--) {
    const hit = hits[i]!;
    front =
      front.slice(0, hit.index) +
      `{{c${hit.n}::${hit.text}}}` +
      front.slice(hit.index + hit.length);
  }

  try {
    assertClozeFront(front);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Invalid blank",
    };
  }
  return { ok: true, front };
}

/**
 * Split an Anki cloze front into DIY sentence + blank fields.
 * Returns null when there are no Anki blanks or underscore blanks are present.
 */
export function parseClozeDiyFields(
  front: string,
): { sentence: string; blanks: string[] } | null {
  const anki = front.match(ANKI_CLOZE_COUNT_RE) ?? [];
  const underscores = front.match(UNDERSCORE_BLANK_RE) ?? [];
  if (anki.length < 1 || underscores.length > 0) return null;
  const blanks = extractClozeAnswers(front);
  if (blanks.length !== anki.length) return null;
  return { sentence: revealClozeFront(front), blanks };
}

export function hasClozeBlank(front: string): boolean {
  const anki = front.match(ANKI_CLOZE_COUNT_RE) ?? [];
  const underscores = front.match(UNDERSCORE_BLANK_RE) ?? [];
  const total = anki.length + underscores.length;
  return total >= 1 && total <= CLOZE_BLANK_MAX;
}

/** @deprecated Prefer hasClozeBlank */
export const hasSingleClozeBlank = hasClozeBlank;

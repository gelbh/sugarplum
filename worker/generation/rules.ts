import { assertSingleCloze, type CardDraft } from "./schema";

const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ANKI_CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::[^}]*)?\}\}/g;
const FENCE_RE = /^```/;

type Provenance = CardDraft["provenance"];

function provenanceFor(line: string): Provenance {
  return { pages: [1], excerpt: line };
}

function qaDraft(front: string, back: string, line: string): CardDraft {
  return {
    type: "qa",
    front: front.trim(),
    back: back.trim(),
    provenance: provenanceFor(line),
  };
}

function clozeDraft(front: string, back: string, line: string): CardDraft | null {
  try {
    assertSingleCloze(front);
  } catch {
    // Skip malformed cloze lines instead of failing the whole harvest/job.
    return null;
  }
  return {
    type: "cloze",
    front,
    back,
    provenance: provenanceFor(line),
  };
}

/** Reject lecture prose mistaken for `term: def` / `term - def`. */
const NON_TERM_LEFT_RE =
  /^(note|notes|figure|fig|chapter|section|table|example|warning|tip|caution|see|cf)\b/i;

/**
 * Vocab-like left side for colon/dash harvest: short, few words, not a sentence
 * lead-in like "The mitochondria" or "Figure 1".
 */
function isVocabTermLeft(left: string): boolean {
  if (left.length > 40) return false;
  const words = left.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  if (NON_TERM_LEFT_RE.test(left)) return false;
  if (/^\d/.test(left)) return false;
  // Articles lead prose ("The mitochondria - …"), not glossary terms.
  if (/^(the|a|an)\b/i.test(left)) return false;
  return true;
}

const BULLET_PREFIX_RE = /^([•\u2022*]|\-\s|\*\s)/;
const TABLE_HEADER_LEFT_RE =
  /^(phylum|hosts?|family|genus|class|order|species|disease|pathology|lifecycle|life cycle|symptoms?|treatment|diagnosis|notes?)$/i;
const GENERIC_SLIDE_RIGHT_RE =
  /^(disease|pathology|lifecycle|life cycle|overview|symptoms?|treatment|diagnosis)$/i;

function stripBulletPrefix(line: string): string {
  return line.replace(/^([•\u2022]\s*|[-*]\s+)/, "").trim();
}

/** True when colon/dash harvest would be lecture chrome, not glossary. */
function isLectureChromePair(left: string, right: string, rawLine: string): boolean {
  if (BULLET_PREFIX_RE.test(rawLine.trim())) return true;
  if (TABLE_HEADER_LEFT_RE.test(left.trim())) return true;
  if (GENERIC_SLIDE_RIGHT_RE.test(right.trim()) && left.split(/\s+/).length <= 3) {
    return true;
  }
  // Truncated / paren debris on the left (e.g. "fission) and produce cysts").
  if (/[)]/.test(left) || left.length < 3) return true;
  return false;
}

function isUsablePipeQa(left: string, right: string, rawLine: string): boolean {
  const pipeCount = (rawLine.match(/\|/g) ?? []).length;
  if (pipeCount !== 1) return false;
  if (TABLE_HEADER_LEFT_RE.test(left.trim())) return false;
  if (TABLE_HEADER_LEFT_RE.test(right.trim())) return false;
  // Both sides look like short labels with no question mark and ≤2 words → table debris.
  const leftWords = left.split(/\s+/).filter(Boolean);
  const rightWords = right.split(/\s+/).filter(Boolean);
  if (
    !left.includes("?") &&
    leftWords.length <= 2 &&
    rightWords.length <= 2 &&
    left.length < 20 &&
    right.length < 20
  ) {
    return false;
  }
  return left.length >= 3 && right.length >= 2;
}

/** Split on first occurrence of separator; both sides must be non-empty after trim. */
function splitOnce(
  line: string,
  separator: string,
): { left: string; right: string } | null {
  const idx = line.indexOf(separator);
  if (idx < 0) return null;
  const left = line.slice(0, idx).trim();
  const right = line.slice(idx + separator.length).trim();
  if (!left || !right) return null;
  return { left, right };
}

function extractAnkiAnswer(marker: string): string {
  const match = /^\{\{c\d+::([\s\S]*?)(?:::[\s\S]*)?\}\}$/.exec(marker);
  return (match?.[1] ?? marker).trim();
}

function harvestLine(line: string): CardDraft[] {
  const trimmed = line.trim();
  if (!trimmed) return [];
  const forPair = stripBulletPrefix(trimmed);

  // Spaced separator only: bare `::` collides with Anki `{{c1::…}}`.
  const doubleColon = splitOnce(trimmed, " :: ");
  if (doubleColon) {
    return [qaDraft(doubleColon.left, doubleColon.right, line)];
  }

  const pipe = splitOnce(trimmed, " | ") ?? splitOnce(trimmed, "|");
  if (pipe && !trimmed.includes("||") && isUsablePipeQa(pipe.left, pipe.right, trimmed)) {
    return [qaDraft(pipe.left, pipe.right, line)];
  }

  const ankiMatches = [...trimmed.matchAll(ANKI_CLOZE_RE)];
  if (ankiMatches.length === 1) {
    const full = ankiMatches[0]![0];
    const answer = extractAnkiAnswer(full);
    if (answer) {
      const draft = clozeDraft(trimmed, answer, line);
      return draft ? [draft] : [];
    }
  }

  const boldMatches = [...trimmed.matchAll(BOLD_RE)];
  if (boldMatches.length >= 1) {
    return boldMatches.flatMap((match, index) => {
      const answer = match[1]!.trim();
      let pos = 0;
      const front = trimmed.replace(BOLD_RE, (_whole, inner: string) => {
        const current = pos;
        pos += 1;
        if (current === index) {
          return `{{c1::${inner.trim()}}}`;
        }
        return String(inner);
      });
      const draft = clozeDraft(front, answer, line);
      return draft ? [draft] : [];
    });
  }

  const colon = splitOnce(forPair, ": ");
  if (colon && !colon.left.includes(":")) {
    if (isLectureChromePair(colon.left, colon.right, trimmed)) return [];
    if (isVocabTermLeft(colon.left)) {
      return [qaDraft(colon.left, colon.right, line)];
    }
  }

  const dash = splitOnce(forPair, " - ");
  if (dash) {
    if (isLectureChromePair(dash.left, dash.right, trimmed)) return [];
    if (isVocabTermLeft(dash.left)) {
      return [qaDraft(dash.left, dash.right, line)];
    }
  }

  return [];
}

/**
 * Deterministic harvest of structured flashcard lines from paste text.
 * Skips fenced code; order follows source line order.
 */
export function harvestRuleDrafts(text: string): CardDraft[] {
  const drafts: CardDraft[] = [];
  let inFence = false;

  for (const line of text.split(/\r?\n/)) {
    if (FENCE_RE.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    drafts.push(...harvestLine(line));
  }

  return drafts;
}

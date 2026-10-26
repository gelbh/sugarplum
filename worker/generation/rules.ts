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

function clozeDraft(front: string, back: string, line: string): CardDraft {
  assertSingleCloze(front);
  return {
    type: "cloze",
    front,
    back,
    provenance: provenanceFor(line),
  };
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

  // Spaced separator only: bare `::` collides with Anki `{{c1::…}}`.
  const doubleColon = splitOnce(trimmed, " :: ");
  if (doubleColon) {
    return [qaDraft(doubleColon.left, doubleColon.right, line)];
  }

  const pipe = splitOnce(trimmed, " | ") ?? splitOnce(trimmed, "|");
  if (pipe && !trimmed.includes("||")) {
    // Single-pipe Q|A only (avoid table-like multi-pipe rows).
    const pipeCount = (trimmed.match(/\|/g) ?? []).length;
    if (pipeCount === 1) {
      return [qaDraft(pipe.left, pipe.right, line)];
    }
  }

  const ankiMatches = [...trimmed.matchAll(ANKI_CLOZE_RE)];
  if (ankiMatches.length === 1) {
    const full = ankiMatches[0]![0];
    const answer = extractAnkiAnswer(full);
    if (answer) {
      return [clozeDraft(trimmed, answer, line)];
    }
  }

  const boldMatches = [...trimmed.matchAll(BOLD_RE)];
  if (boldMatches.length >= 1) {
    return boldMatches.map((match, index) => {
      const answer = match[1]!.trim();
      let pos = 0;
      const front = trimmed.replace(BOLD_RE, (whole, inner: string) => {
        const current = pos;
        pos += 1;
        if (current === index) {
          return `{{c1::${inner}}}`;
        }
        return inner;
      });
      return clozeDraft(front, answer, line);
    });
  }

  const colon = splitOnce(trimmed, ": ");
  if (colon && !colon.left.includes(":")) {
    return [qaDraft(colon.left, colon.right, line)];
  }

  const dash = splitOnce(trimmed, " - ");
  if (dash) {
    return [qaDraft(dash.left, dash.right, line)];
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

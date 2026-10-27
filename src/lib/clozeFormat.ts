/** Anki-style cloze: {{c1::answer}} or {{c2::answer::hint}} */
const ANKI_CLOZE_RE = /\{\{c\d+::([\s\S]*?)(?:::(.*?))?\}\}/g;

const ANKI_CLOZE_ONCE_RE = /\{\{c\d+::([\s\S]*?)(?:::(.*?))?\}\}/;

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

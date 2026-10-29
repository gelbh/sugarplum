const DECK_ROOT = "Sugarplum";

/** Replace `:` and strip control chars so Anki `::` deck paths stay valid. */
export function sanitizeAnkiDeckComponent(raw: string): string {
  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    out += ch === ":" ? "-" : ch;
  }
  return out;
}

/**
 * Anki deck path. Always suffixes a short deck id so same-titled decks
 * do not merge when building a multi-deck `.apkg`.
 */
export function ankiDeckName(
  subjectTitle: string,
  deckTitle: string,
  deckId: string,
): string {
  const subject = sanitizeAnkiDeckComponent(subjectTitle);
  const deck = sanitizeAnkiDeckComponent(deckTitle);
  const suffix = sanitizeAnkiDeckComponent(deckId.slice(0, 8));
  return `${DECK_ROOT}::${subject}::${deck} (${suffix})`;
}

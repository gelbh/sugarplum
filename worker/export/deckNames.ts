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

export function ankiDeckName(subjectTitle: string, deckTitle: string): string {
  const subject = sanitizeAnkiDeckComponent(subjectTitle);
  const deck = sanitizeAnkiDeckComponent(deckTitle);
  return `${DECK_ROOT}::${subject}::${deck}`;
}

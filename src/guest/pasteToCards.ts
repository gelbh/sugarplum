export type GuestPasteCard = { front: string; back: string };

const MIN_CHUNK = 12;
const MAX_CARDS = 40;
const FRONT_CAP = 160;

function cardFromChunk(chunk: string): GuestPasteCard | null {
  const lines = chunk.split("\n");
  const questionIdx = lines.findIndex((line) => line.trimEnd().endsWith("?"));
  if (questionIdx >= 0) {
    const front = lines[questionIdx]!.trim();
    const back = lines
      .filter((_, i) => i !== questionIdx)
      .join("\n")
      .trim();
    return { front, back: back || "Review your notes." };
  }

  const colonIdx = chunk.indexOf(":");
  if (colonIdx >= 0) {
    const front = chunk.slice(0, colonIdx).trim();
    const back = chunk.slice(colonIdx + 1).trim();
    if (!front || !back) return null;
    return { front, back };
  }

  const dotSpace = chunk.indexOf(". ");
  const ideographic = chunk.indexOf("。");
  let splitAt = -1;
  let frontEnd = -1;
  if (dotSpace >= 0 && (ideographic < 0 || dotSpace < ideographic)) {
    splitAt = dotSpace;
    frontEnd = dotSpace + 1; // include the period
  } else if (ideographic >= 0) {
    splitAt = ideographic;
    frontEnd = ideographic + 1; // include 。
  }

  let front: string;
  let back: string;
  if (splitAt >= 0) {
    front = chunk.slice(0, frontEnd).trim();
    back = chunk.slice(frontEnd).trim();
  } else {
    front = chunk.trim();
    back = "";
  }

  if (front.length > FRONT_CAP) {
    const capped = front.slice(0, FRONT_CAP);
    const overflow = front.slice(FRONT_CAP) + (back ? ` ${back}` : "");
    front = capped;
    back = overflow.trim();
  }

  return { front, back: back || "See notes." };
}

/** Pure client paste → Q&A cards. No store writes. */
export function guestPasteToCards(text: string): GuestPasteCard[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const chunks = trimmed
    .split(/\n\s*\n/)
    .map((c) => c.trim())
    .filter((c) => c.length >= MIN_CHUNK);

  const cards: GuestPasteCard[] = [];
  for (const chunk of chunks) {
    if (cards.length >= MAX_CARDS) break;
    const card = cardFromChunk(chunk);
    if (card) cards.push(card);
  }
  return cards;
}

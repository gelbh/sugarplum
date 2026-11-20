import {
  collapseSeparators,
  entryNameForms,
  searchable,
  type NameMatchEntry,
} from "./nameMatch";
import type { FocusMaterial } from "./focusScan";

/** Rule 2: the epithet must start within this many characters of the genus. */
const EPITHET_WINDOW = 60;
/** Rule 3: `spp`, `sp.` or `species` must start within this many characters. */
const PLURAL_WINDOW = 8;

type Token = { text: string; start: number; end: number };

type Scanned = {
  hay: string;
  tokens: Token[];
  /** Token positions per distinct token text. */
  byText: Map<string, number[]>;
  /** Memo: name part -> positions of tokens that match it under rule 5. */
  hits: Map<string, ReadonlySet<number>>;
};

type NameParts = { genus: string; epithet: string | null; sppEntry: boolean };

/**
 * Optimal string alignment Damerau-Levenshtein (adjacent swaps cost 1),
 * with three rolling rows so a rescan does not allocate a matrix per token.
 */
export function damerauLevenshtein(a: string, b: string): number {
  let before = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], before[j - 2] + 1);
      }
    }
    [before, prev, cur] = [prev, cur, before];
  }
  return prev[b.length];
}

/** Rule 5: a text token of 7+ chars allows 1 edit, 8+ chars allows 2. */
export function tokenMatches(token: string, target: string): boolean {
  if (token === target) return true;
  const allowed = token.length >= 8 ? 2 : token.length >= 7 ? 1 : 0;
  if (allowed === 0 || Math.abs(token.length - target.length) > allowed) {
    return false;
  }
  return damerauLevenshtein(token, target) <= allowed;
}

function scan(text: string): Scanned {
  const hay = searchable(collapseSeparators(text));
  const tokens: Token[] = [];
  const byText = new Map<string, number[]>();
  for (const m of hay.matchAll(/[a-z]+/g)) {
    const at = tokens.length;
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    const list = byText.get(m[0]);
    if (list) list.push(at);
    else byText.set(m[0], [at]);
  }
  return { hay, tokens, byText, hits: new Map() };
}

// Pages are scanned once per refresh, not once per entry.
const scannedPages = new WeakMap<object, Scanned>();

function scanPage(page: { text: string }): Scanned {
  let scanned = scannedPages.get(page);
  if (!scanned) {
    scanned = scan(page.text);
    scannedPages.set(page, scanned);
  }
  return scanned;
}

function hitsFor(scanned: Scanned, target: string): ReadonlySet<number> {
  let hits = scanned.hits.get(target);
  if (!hits) {
    const found = new Set<number>();
    for (const [text, positions] of scanned.byText) {
      if (tokenMatches(text, target)) positions.forEach((p) => found.add(p));
    }
    hits = found;
    scanned.hits.set(target, hits);
  }
  return hits;
}

function nameParts(canonicalName: string): NameParts | null {
  const [first = "", second = ""] = searchable(canonicalName).split(" ");
  const genus = first.replace(/[^a-z]/g, "");
  if (genus === "") return null;
  const sppEntry = second === "spp." || second === "spp";
  const epithet = sppEntry ? null : second.replace(/[^a-z]/g, "") || null;
  return { genus, epithet, sppEntry };
}

function isPluralMarker(hay: string, t: Token): boolean {
  return (
    t.text === "spp" ||
    t.text === "species" ||
    (t.text === "sp" && hay[t.end] === ".")
  );
}

/** Rules 2 to 5 on one normalized text. */
function lenientMention(scanned: Scanned, parts: NameParts): boolean {
  const genusAt = hitsFor(scanned, parts.genus);
  if (genusAt.size === 0) return false;
  if (parts.sppEntry) return true;
  const epithetAt = parts.epithet
    ? hitsFor(scanned, parts.epithet)
    : new Set<number>();
  const { hay, tokens } = scanned;
  for (const i of genusAt) {
    const genusEnd = tokens[i].end;
    for (let j = i + 1; j < tokens.length; j++) {
      const gap = tokens[j].start - genusEnd;
      if (gap > EPITHET_WINDOW) break;
      if (gap <= PLURAL_WINDOW && isPluralMarker(hay, tokens[j])) return true;
      if (epithetAt.has(j)) return true;
    }
  }
  return false;
}

function mentions(
  scanned: Scanned,
  forms: readonly string[],
  parts: NameParts | null,
): boolean {
  // Rule 1: the same substring test as textMentionsEntry, on cached text.
  if (forms.some((f) => scanned.hay.includes(f))) return true;
  return parts !== null && lenientMention(scanned, parts);
}

export function materialMentionsForPack(
  entry: NameMatchEntry,
  material: FocusMaterial,
): boolean {
  const forms = entryNameForms(entry).map((f) =>
    searchable(collapseSeparators(f)),
  );
  const parts = nameParts(entry.canonicalName);
  if (material.filename && mentions(scan(material.filename), forms, parts)) {
    return true;
  }
  return material.pages.some((p) => mentions(scanPage(p), forms, parts));
}

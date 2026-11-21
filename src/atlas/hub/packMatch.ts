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
  /** Distinct token texts of 7+ chars, by length, for rule 5 candidates. */
  byLength: Map<number, string[]>;
  /** Memo: name part -> positions of tokens that match it under rule 5. */
  hits: Map<string, ReadonlySet<number>>;
};

type NameParts = { genus: string; epithet: string | null; sppEntry: boolean };

/** One entry's normalized match targets, built once per scan. */
export type PackTargets = {
  forms: string[];
  parts: NameParts | null;
  /** Atlas genera; rule 2 stops at any of them except the entry's own. */
  stopGenera: ReadonlySet<string>;
};

/** Rule 5 never allows more than this many edits. */
const MAX_EDITS = 2;
/** Rule 5 needs a token of at least this length for any edit. */
const MIN_FUZZY_LENGTH = 7;

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

/**
 * `damerauLevenshtein(a, b) <= max`, stopping once two consecutive rows
 * exceed `max`: later cells build only on the previous two rows.
 */
function withinEdits(a: string, b: string, max: number): boolean {
  let before = new Array<number>(b.length + 1).fill(0);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  let cur = new Array<number>(b.length + 1).fill(0);
  let prevMin = 0;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        cur[j] = Math.min(cur[j], before[j - 2] + 1);
      }
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max && prevMin > max) return false;
    prevMin = rowMin;
    [before, prev, cur] = [prev, cur, before];
  }
  return prev[b.length] <= max;
}

/** Rule 5: a text token of 7+ chars allows 1 edit, 8+ chars allows 2. */
export function tokenMatches(token: string, target: string): boolean {
  if (token === target) return true;
  const allowed = token.length >= 8 ? 2 : token.length >= 7 ? 1 : 0;
  if (allowed === 0 || Math.abs(token.length - target.length) > allowed) {
    return false;
  }
  return withinEdits(token, target, allowed);
}

function scan(text: string): Scanned {
  const hay = searchable(collapseSeparators(text));
  const tokens: Token[] = [];
  const byText = new Map<string, number[]>();
  const byLength = new Map<number, string[]>();
  for (const m of hay.matchAll(/[a-z]+/g)) {
    const at = tokens.length;
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    const list = byText.get(m[0]);
    if (list) {
      list.push(at);
      continue;
    }
    byText.set(m[0], [at]);
    if (m[0].length < MIN_FUZZY_LENGTH) continue;
    const sameLength = byLength.get(m[0].length);
    if (sameLength) sameLength.push(m[0]);
    else byLength.set(m[0].length, [m[0]]);
  }
  return { hay, tokens, byText, byLength, hits: new Map() };
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

const scannedFilenames = new WeakMap<FocusMaterial, Scanned>();

function scanFilename(material: FocusMaterial, filename: string): Scanned {
  let scanned = scannedFilenames.get(material);
  if (!scanned) {
    scanned = scan(filename);
    scannedFilenames.set(material, scanned);
  }
  return scanned;
}

/**
 * Letters of `token` not covered by `target` (as multisets). Each edit adds
 * at most one, so a count above the allowed edits rules a token out early.
 */
function excessLetters(token: string, targetCounts: Int16Array): number {
  let excess = 0;
  for (let i = 0; i < token.length; i++) {
    if (--targetCounts[token.charCodeAt(i) - 97] < 0) excess++;
  }
  for (let i = 0; i < token.length; i++) {
    targetCounts[token.charCodeAt(i) - 97]++;
  }
  return excess;
}

function hitsFor(scanned: Scanned, target: string): ReadonlySet<number> {
  let hits = scanned.hits.get(target);
  if (!hits) {
    const found = new Set<number>(scanned.byText.get(target));
    const targetCounts = new Int16Array(26);
    for (let i = 0; i < target.length; i++) {
      targetCounts[target.charCodeAt(i) - 97]++;
    }
    // tokenMatches needs |token - target| <= edits <= 2 and a 7+ char token,
    // so only those lengths can add fuzzy hits.
    const from = Math.max(MIN_FUZZY_LENGTH, target.length - MAX_EDITS);
    for (let len = from; len <= target.length + MAX_EDITS; len++) {
      for (const text of scanned.byLength.get(len) ?? []) {
        if (text === target) continue;
        if (excessLetters(text, targetCounts) > MAX_EDITS) continue;
        if (!tokenMatches(text, target)) continue;
        scanned.byText.get(text)?.forEach((p) => found.add(p));
      }
    }
    hits = found;
    scanned.hits.set(target, hits);
  }
  return hits;
}

function genusOf(canonicalName: string): string {
  const [first = ""] = searchable(canonicalName).split(" ");
  return first.replace(/[^a-z]/g, "");
}

/** Normalized genus of every entry, for the rule 2 stop list. */
export function atlasGenera(entries: readonly NameMatchEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) {
    const genus = genusOf(e.canonicalName);
    if (genus !== "") out.add(genus);
  }
  return out;
}

function nameParts(canonicalName: string): NameParts | null {
  const [, second = ""] = searchable(canonicalName).split(" ");
  const genus = genusOf(canonicalName);
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
function lenientMention(
  scanned: Scanned,
  parts: NameParts,
  stopGenera: ReadonlySet<string>,
): boolean {
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
      // Another entry's genus starts a new name; its epithet is not ours.
      const t = tokens[j].text;
      if (t !== parts.genus && stopGenera.has(t)) break;
    }
  }
  return false;
}

/** Rule 1: the same substring test as textMentionsEntry, on cached text. */
function strictMention(scanned: Scanned, forms: readonly string[]): boolean {
  return forms.some((f) => scanned.hay.includes(f));
}

export function packTargets(
  entry: NameMatchEntry,
  genera: ReadonlySet<string> = new Set(),
): PackTargets {
  return {
    forms: entryNameForms(entry).map((f) => searchable(collapseSeparators(f))),
    parts: nameParts(entry.canonicalName),
    stopGenera: genera,
  };
}

/**
 * `strict` is rule 1 alone (what tiers use); `lenient` adds rules 2 to 5
 * (what pack hiding uses). Both read the same cached normalized text.
 */
export type PackMaterialMatch = { strict: boolean; lenient: boolean };

export function matchMaterialForPack(
  targets: PackTargets,
  material: FocusMaterial,
): PackMaterialMatch {
  const { forms, parts, stopGenera } = targets;
  const texts = material.pages.map(scanPage);
  if (material.filename) {
    texts.unshift(scanFilename(material, material.filename));
  }
  if (texts.some((t) => strictMention(t, forms))) {
    return { strict: true, lenient: true };
  }
  const lenient = parts !== null && texts.some((t) => lenientMention(t, parts, stopGenera));
  return { strict: false, lenient };
}

export function materialMentionsForPack(
  entry: NameMatchEntry,
  material: FocusMaterial,
  genera?: ReadonlySet<string>,
): boolean {
  return matchMaterialForPack(packTargets(entry, genera), material).lenient;
}

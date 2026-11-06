import type { CardDraft } from "./schema";
import { CHUNK_CHAR_LIMIT, chunkText, MAX_PIPELINE_CHUNKS } from "./pipeline";

/**
 * Token-overlap bar for "same fact, different wording".
 * A single differing content token still counts (added adjective).
 * Two differing tokens stay (site-of-infection questions for two species).
 */
const NEAR_DUP_JACCARD = 0.6;
const NEAR_DUP_MAX_DIFF = 1;

const MAX_USED_KEYS = 80;
const MAX_FINGERPRINT_TOKENS = 40;

const STOP = new Set([
  "the",
  "and",
  "for",
  "are",
  "was",
  "were",
  "what",
  "which",
  "who",
  "how",
  "does",
  "did",
  "that",
  "this",
  "with",
  "from",
  "into",
  "its",
  "than",
  "then",
  "have",
  "has",
  "had",
  "not",
  "but",
  "you",
  "your",
  "can",
  "may",
  "will",
  "about",
]);

const BOILER_HEAD_RE =
  /^(table of contents|contents|references|bibliography|works cited|index|acknowledgements|acknowledgments|further reading|learning objectives|objectives)\b/i;

export type StudyPage = { page: number; text: string };

export type WindowResume = {
  used_keys: string[];
  next_page: number;
  total_pages: number;
};

export type PreparedStudySource = {
  text: string;
  rangeExhausted: boolean;
  resume: WindowResume;
};

type Candidate = { text: string; page: number; index: number };

function contentTokens(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (STOP.has(word) || seen.has(word)) continue;
    seen.add(word);
    out.push(word);
  }
  return out;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const bSet = new Set(b);
  let inter = 0;
  for (const token of a) {
    if (bSet.has(token)) inter += 1;
  }
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export function windowFingerprint(text: string): string {
  return contentTokens(text).slice(0, MAX_FINGERPRINT_TOKENS).sort().join(" ");
}

function isBoilerplate(text: string): boolean {
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return true;
  if (BOILER_HEAD_RE.test(lines[0] ?? "")) return true;
  const dotted = lines.filter(
    (line) => /\.{4,}\s*\d+$/.test(line) || /\s{3,}\d+$/.test(line),
  ).length;
  return lines.length >= 6 && dotted / lines.length > 0.5;
}

function scoreWindow(text: string, topicHints: string[]): number {
  const tokens = contentTokens(text);
  let score = new Set(tokens).size;
  const numbers = text.match(/\d+(?:\.\d+)?/g)?.length ?? 0;
  score += Math.min(numbers, 20) * 2;
  const lower = text.toLowerCase();
  for (const hint of topicHints) {
    const needle = hint.toLowerCase().trim();
    if (needle.length >= 3 && lower.includes(needle)) score += 40;
  }
  return score;
}

function skippedByUsedKeys(text: string, usedKeys: string[]): boolean {
  const key = windowFingerprint(text);
  // Exact key only. Short bullets still count; a sibling section does not.
  if (!key) return false;
  return usedKeys.includes(key);
}

function contentDiffCount(a: string[], b: string[]): number {
  const aSet = new Set(a);
  const bSet = new Set(b);
  let diff = 0;
  for (const token of aSet) if (!bSet.has(token)) diff += 1;
  for (const token of bSet) if (!aSet.has(token)) diff += 1;
  return diff;
}

function normalizeFront(front: string): string {
  return front.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when `front` restates one of `existing` (exact, or token overlap). */
export function isNearDuplicateFront(
  front: string,
  existing: readonly string[],
): boolean {
  const norm = normalizeFront(front);
  if (!norm) return false;
  const tokens = contentTokens(front);
  for (const other of existing) {
    if (normalizeFront(other) === norm) return true;
    if (tokens.length < 3) continue;
    const otherTokens = contentTokens(other);
    if (otherTokens.length < 3) continue;
    if (
      jaccard(tokens, otherTokens) >= NEAR_DUP_JACCARD &&
      contentDiffCount(tokens, otherTokens) <= NEAR_DUP_MAX_DIFF
    ) {
      return true;
    }
  }
  return false;
}

export function filterNovelDrafts(
  drafts: CardDraft[],
  existingFronts: readonly string[],
): CardDraft[] {
  const seen = [...existingFronts];
  const out: CardDraft[] = [];
  for (const draft of drafts) {
    if (typeof draft.front !== "string") {
      out.push(draft);
      continue;
    }
    if (isNearDuplicateFront(draft.front, seen)) continue;
    seen.push(draft.front);
    out.push(draft);
  }
  return out;
}

export function readWindowResume(raw: string | null | undefined): WindowResume | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const resume = (parsed as { window_resume?: unknown }).window_resume;
    if (!resume || typeof resume !== "object") return null;
    const row = resume as {
      used_keys?: unknown;
      next_page?: unknown;
      total_pages?: unknown;
    };
    const used = Array.isArray(row.used_keys)
      ? row.used_keys.filter((key): key is string => typeof key === "string")
      : [];
    const next = typeof row.next_page === "number" ? row.next_page : 1;
    const total = typeof row.total_pages === "number" ? row.total_pages : 0;
    return { used_keys: used, next_page: next, total_pages: total };
  } catch {
    return null;
  }
}

/** Union prior job resumes. `startPage` is the furthest next page any job recorded. */
export function mergeWindowResumes(
  raws: readonly (string | null | undefined)[],
): { startPage: number; usedKeys: string[] } {
  const used: string[] = [];
  const seen = new Set<string>();
  let startPage = 1;
  for (const raw of raws) {
    const resume = readWindowResume(raw);
    if (!resume) continue;
    if (resume.next_page > startPage) startPage = resume.next_page;
    for (const key of resume.used_keys) {
      if (seen.has(key)) continue;
      seen.add(key);
      used.push(key);
    }
  }
  return { startPage, usedKeys: used.slice(-MAX_USED_KEYS) };
}

function capKeys(keys: string[]): string[] {
  return keys.slice(-MAX_USED_KEYS);
}

/**
 * Pick up to `limit` high-yield chunks from `pages`.
 * Contents, references, and already-used windows lose when any other text exists.
 */
export function prepareStudySource(args: {
  pages: StudyPage[];
  topicHints?: string[];
  usedKeys?: string[];
  limit: number;
  pageStart: number;
  pageEnd: number;
  totalPages: number;
}): PreparedStudySource {
  const topicHints = args.topicHints ?? [];
  const usedKeys = args.usedKeys ?? [];
  const candidates: Candidate[] = [];
  let index = 0;
  for (const page of args.pages) {
    const chunks = chunkText(page.text, CHUNK_CHAR_LIMIT - 50);
    for (const chunk of chunks) {
      candidates.push({ text: chunk, page: page.page, index });
      index += 1;
    }
  }

  const fresh = candidates.filter((candidate) => {
    const lower = candidate.text.toLowerCase();
    const topicHit = topicHints.some((hint) => {
      const needle = hint.toLowerCase().trim();
      return needle.length >= 3 && lower.includes(needle);
    });
    // A named topic may revisit a window; untagged runs move on.
    if (topicHit) return true;
    return !skippedByUsedKeys(candidate.text, usedKeys);
  });
  const study = fresh.filter((c) => !isBoilerplate(c.text));
  const pool = study.length > 0 ? study : fresh;

  const baseResume = {
    used_keys: capKeys(usedKeys),
    total_pages: args.totalPages,
  };

  if (pool.length === 0) {
    return {
      text: "",
      rangeExhausted: true,
      resume: {
        ...baseResume,
        next_page: args.pageEnd + 1,
      },
    };
  }

  const ranked = [...pool].sort((a, b) => {
    const delta = scoreWindow(b.text, topicHints) - scoreWindow(a.text, topicHints);
    if (delta !== 0) return delta;
    return a.index - b.index;
  });
  const picked = ranked
    .slice(0, Math.max(1, args.limit))
    .sort((a, b) => a.index - b.index);

  const added = picked.map((c) => windowFingerprint(c.text)).filter(Boolean);
  const rangeExhausted = ranked.length <= picked.length;

  return {
    text: picked.map((c) => c.text).join("\n\n"),
    rangeExhausted,
    resume: {
      used_keys: capKeys([...usedKeys, ...added]),
      next_page: rangeExhausted ? args.pageEnd + 1 : args.pageStart,
      total_pages: args.totalPages,
    },
  };
}

/**
 * Read one window, and the next window once if the first has no study text.
 * Stops there so an empty prefix cannot scan the rest of the file in one job.
 */
export async function focusStudyPages(
  load: (startPage: number) => Promise<{
    pages: StudyPage[];
    pageStart: number;
    pageEnd: number;
    totalPages: number;
  }>,
  args: { startPage: number; topicHints: string[]; usedKeys: string[] },
): Promise<{ text: string; resume: WindowResume }> {
  let start = args.startPage;
  let prepared: PreparedStudySource | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const window = await load(start);
    prepared = prepareStudySource({
      pages: window.pages,
      topicHints: args.topicHints,
      usedKeys: args.usedKeys,
      limit: MAX_PIPELINE_CHUNKS,
      pageStart: window.pageStart,
      pageEnd: window.pageEnd,
      totalPages: window.totalPages,
    });
    if (prepared.text.trim() || window.pageEnd >= window.totalPages) break;
    start = window.pageEnd + 1;
  }
  return {
    text: prepared?.text ?? "",
    resume: prepared?.resume ?? {
      used_keys: capKeys(args.usedKeys),
      next_page: args.startPage,
      total_pages: 0,
    },
  };
}

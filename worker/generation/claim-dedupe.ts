import type { StoredClaim } from "./claims";

/** Fuzzy Jaccard threshold on claim text tokens (stricter than card fronts at 0.6). */
export const CLAIM_FUZZY_JACCARD = 0.8;

/** Semantic cosine threshold for paraphrase merge. */
export const CLAIM_SEMANTIC_COSINE = 0.95;

export type EmbedTextsFn = (
  texts: string[],
) => Promise<number[][] | null>;

function normalizeField(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function claimExactKey(claim: StoredClaim): string {
  const object = claim.object ? normalizeField(claim.object) : "";
  return `${normalizeField(claim.subject)}|${normalizeField(claim.predicate)}|${object}`;
}

export function claimText(claim: StoredClaim): string {
  const parts = [claim.subject, claim.predicate];
  if (claim.object) parts.push(claim.object);
  return parts.join(" ");
}

function contentTokens(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    if (seen.has(word)) continue;
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

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function unionPages(
  a: number[] | undefined,
  b: number[] | undefined,
): number[] | undefined {
  const set = new Set<number>([...(a ?? []), ...(b ?? [])]);
  if (set.size === 0) return undefined;
  return [...set].sort((x, y) => x - y);
}

/**
 * Keep `into` id and `source_span` (first wins: draft excerpt join is exact).
 * Fold pages and optional richer fields from `from`.
 */
export function mergeClaimInto(
  into: StoredClaim,
  from: StoredClaim,
): StoredClaim {
  const pages = unionPages(into.pages, from.pages);
  const merged: StoredClaim = { ...into };
  if (pages) merged.pages = pages;
  if (!merged.object && from.object) merged.object = from.object;
  if (
    (!merged.qualifiers || merged.qualifiers.length === 0) &&
    from.qualifiers?.length
  ) {
    merged.qualifiers = [...from.qualifiers];
  }
  return merged;
}

function clusterClaims(
  claims: StoredClaim[],
  shouldUnite: (i: number, j: number) => boolean,
): StoredClaim[] {
  if (claims.length <= 1) return claims;
  const parent = claims.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (ra < rb) parent[rb] = ra;
    else parent[ra] = rb;
  };

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      if (shouldUnite(i, j)) unite(i, j);
    }
  }

  const clusters = new Map<number, StoredClaim>();
  const clusterOrder: number[] = [];
  for (let i = 0; i < claims.length; i++) {
    const root = find(i);
    const existing = clusters.get(root);
    if (!existing) {
      clusters.set(root, claims[i]!);
      clusterOrder.push(root);
    } else {
      clusters.set(root, mergeClaimInto(existing, claims[i]!));
    }
  }
  return clusterOrder.map((root) => clusters.get(root)!);
}

function mergeExact(claims: StoredClaim[]): StoredClaim[] {
  const byKey = new Map<string, StoredClaim>();
  const order: string[] = [];
  for (const claim of claims) {
    const key = claimExactKey(claim);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, claim);
      order.push(key);
    } else {
      byKey.set(key, mergeClaimInto(existing, claim));
    }
  }
  return order.map((key) => byKey.get(key)!);
}

function claimsFuzzyDup(a: StoredClaim, b: StoredClaim): boolean {
  if (claimExactKey(a) === claimExactKey(b)) return true;
  return (
    jaccard(contentTokens(claimText(a)), contentTokens(claimText(b))) >=
    CLAIM_FUZZY_JACCARD
  );
}

function mergeFuzzy(claims: StoredClaim[]): StoredClaim[] {
  // Transitive: A≈B and B≈C → one cluster (union-find), not greedy first-match.
  return clusterClaims(claims, (i, j) =>
    claimsFuzzyDup(claims[i]!, claims[j]!),
  );
}

async function mergeSemantic(
  claims: StoredClaim[],
  embedTexts: EmbedTextsFn,
): Promise<StoredClaim[]> {
  if (claims.length <= 1) return claims;
  let vectors: number[][] | null;
  try {
    vectors = await embedTexts(claims.map(claimText));
  } catch {
    return claims;
  }
  if (!vectors || vectors.length !== claims.length) return claims;

  return clusterClaims(
    claims,
    (i, j) =>
      cosineSimilarity(vectors[i]!, vectors[j]!) >= CLAIM_SEMANTIC_COSINE,
  );
}

/** Exact → fuzzy → optional semantic (fail-open). First id in each cluster wins. */
export async function mergeClaimsForJob(
  claims: StoredClaim[],
  embedTexts?: EmbedTextsFn | null,
): Promise<StoredClaim[]> {
  if (claims.length <= 1) return claims;
  const afterExact = mergeExact(claims);
  const afterFuzzy = mergeFuzzy(afterExact);
  if (afterFuzzy.length <= 1 || !embedTexts) return afterFuzzy;
  return mergeSemantic(afterFuzzy, embedTexts);
}

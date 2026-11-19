import { buildClaimSpanCoverage } from "./claim-span-coverage";
import type { StoredClaim } from "./claims";

/** Max gap re-extract passes per chunk after the main extract. */
export const CLAIM_GAP_EXTRACT_MAX = 1;

export type ClaimGapExtractResult = {
  claims: StoredClaim[];
  gaps: string[];
  passes: number;
};

function spanKey(span: string): string {
  return span.replace(/\s+/g, " ").trim().toLowerCase();
}

function mergeBySpan(
  existing: StoredClaim[],
  incoming: StoredClaim[],
): StoredClaim[] {
  const seen = new Set(existing.map((c) => spanKey(c.source_span)));
  const out = [...existing];
  for (const claim of incoming) {
    const key = spanKey(claim.source_span);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(claim);
  }
  return out;
}

/**
 * Re-extract claims for uncovered material lines until empty or maxPasses.
 * Soft-fail: extractOnce throw keeps current claims and gaps.
 */
export async function runClaimGapExtract(args: {
  material: string;
  claims: StoredClaim[];
  extractOnce: (uncoveredLines: string[]) => Promise<StoredClaim[]>;
  maxPasses?: number;
}): Promise<ClaimGapExtractResult> {
  const maxPasses = args.maxPasses ?? CLAIM_GAP_EXTRACT_MAX;
  let claims = [...args.claims];
  let passes = 0;

  while (passes < maxPasses) {
    const ledger = buildClaimSpanCoverage(args.material, claims);
    if (ledger.gaps.length === 0) {
      return { claims, gaps: [], passes };
    }

    try {
      const novel = await args.extractOnce(ledger.gaps);
      passes += 1;
      const before = claims.length;
      claims = mergeBySpan(claims, novel);
      if (claims.length === before) {
        const after = buildClaimSpanCoverage(args.material, claims);
        return { claims, gaps: after.gaps, passes };
      }
    } catch {
      const after = buildClaimSpanCoverage(args.material, claims);
      return { claims, gaps: after.gaps, passes };
    }
  }

  const finalLedger = buildClaimSpanCoverage(args.material, claims);
  return { claims, gaps: finalLedger.gaps, passes };
}

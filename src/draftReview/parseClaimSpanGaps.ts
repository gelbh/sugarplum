/** Parse additive coverage_json.claim_span.gaps; empty when missing/invalid. */
export function parseClaimSpanGaps(coverageJson: string | null): string[] {
  if (!coverageJson) return [];
  try {
    const parsed: unknown = JSON.parse(coverageJson);
    if (!parsed || typeof parsed !== "object") return [];
    const claimSpan = (parsed as { claim_span?: unknown }).claim_span;
    if (!claimSpan || typeof claimSpan !== "object") return [];
    const gaps = (claimSpan as { gaps?: unknown }).gaps;
    if (!Array.isArray(gaps)) return [];
    return gaps.filter((g): g is string => typeof g === "string" && g.trim().length > 0);
  } catch {
    return [];
  }
}

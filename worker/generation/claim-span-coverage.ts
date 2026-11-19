export type ClaimSpanCoverage = {
  covered_units: string[];
  gaps: string[];
  claim_count: number;
};

const GAP_LINE_MIN = 8;
const GAP_CAP = 20;

function normalizeWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * A short shared phrase must not mark unrelated lines covered. Require the
 * span to be most of the line (or the line to be contained in a longer span).
 */
function lineIsCoveredBySpans(
  line: string,
  spans: string[],
): boolean {
  const needle = normalizeWs(line).toLowerCase();
  if (!needle) return true;
  const minSpanForLine = Math.max(
    GAP_LINE_MIN,
    Math.ceil(needle.length * 0.5),
  );
  for (const raw of spans) {
    const part = normalizeWs(raw).toLowerCase();
    if (!part) continue;
    if (part.includes(needle)) return true;
    if (part.length >= minSpanForLine && needle.includes(part)) return true;
  }
  return false;
}

/**
 * Material lines not hit by any claim source_span (whitespace-normalized
 * substring), same unit rules as draft buildCoverageLedger.
 */
export function buildClaimSpanCoverage(
  material: string,
  claims: { source_span: string }[],
): ClaimSpanCoverage {
  const spans = claims
    .map((c) => c.source_span)
    .filter((s) => normalizeWs(s).length > 0);

  const covered_units: string[] = [];
  const gaps: string[] = [];
  const seen = new Set<string>();

  for (const raw of material.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.length < GAP_LINE_MIN) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    if (lineIsCoveredBySpans(line, spans)) {
      covered_units.push(line);
    } else {
      gaps.push(line);
      if (gaps.length >= GAP_CAP) break;
    }
  }

  return {
    covered_units,
    gaps,
    claim_count: claims.length,
  };
}

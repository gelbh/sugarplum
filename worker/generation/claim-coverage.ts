export type ClaimCoverageRow = {
  id: string;
  subject: string;
  predicate: string;
  object?: string | null;
  card_id: string | null;
  card_status?: string | null;
  /** Present when the projection selects study_claims.job_id (deck / job). */
  job_id?: string | null;
};

export type ClaimCoverage = {
  claims: ClaimCoverageRow[];
  summary: { total: number; linked: number; orphan: number };
};

/** Summarize SQL one-row-per-claim rows (no in-process dedupe). */
export function buildClaimCoverage(rows: ClaimCoverageRow[]): ClaimCoverage {
  const linked = rows.filter((c) => c.card_id != null).length;
  return {
    claims: rows,
    summary: {
      total: rows.length,
      linked,
      orphan: rows.length - linked,
    },
  };
}

export type ClaimCoverageRow = {
  id: string;
  subject: string;
  predicate: string;
  object?: string | null;
  source_span: string;
  pages?: number[] | null;
  card_id: string | null;
  card_status?: string | null;
};

export type ClaimCoverage = {
  claims: ClaimCoverageRow[];
  summary: { total: number; linked: number; orphan: number };
};

type RawRow = {
  id: string;
  subject: string;
  predicate: string;
  object: string | null;
  source_span: string;
  pages_json: string | null;
  card_id: string | null;
  card_status: string | null;
  card_created_at?: string | null;
};

function parsePages(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const pages = parsed.filter(
      (p): p is number => typeof p === "number" && Number.isFinite(p),
    );
    return pages.length > 0 ? pages : null;
  } catch {
    return null;
  }
}

/** Collapse LEFT JOIN duplicates: one row per claim, earliest card wins. */
export function buildClaimCoverage(rows: RawRow[]): ClaimCoverage {
  const byId = new Map<
    string,
    ClaimCoverageRow & { _created?: string | null }
  >();
  for (const row of rows) {
    const existing = byId.get(row.id);
    const pages = parsePages(row.pages_json);
    if (!existing) {
      byId.set(row.id, {
        id: row.id,
        subject: row.subject,
        predicate: row.predicate,
        object: row.object,
        source_span: row.source_span,
        pages,
        card_id: row.card_id,
        card_status: row.card_status ?? undefined,
        _created: row.card_created_at ?? null,
      });
      continue;
    }
    if (
      row.card_id &&
      (!existing.card_id ||
        (row.card_created_at &&
          existing._created &&
          row.card_created_at < existing._created) ||
        (row.card_created_at && !existing._created))
    ) {
      existing.card_id = row.card_id;
      existing.card_status = row.card_status ?? undefined;
      existing._created = row.card_created_at ?? null;
    }
  }
  const claims: ClaimCoverageRow[] = [...byId.values()].map(
    ({ _created: _c, ...rest }) => rest,
  );
  const linked = claims.filter((c) => c.card_id != null).length;
  return {
    claims,
    summary: {
      total: claims.length,
      linked,
      orphan: claims.length - linked,
    },
  };
}

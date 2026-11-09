/** Primary display name (common) with optional distinct scientific subtitle. */
export function entryTitles(entry: {
  commonName: string | null;
  canonicalName: string;
}): { primary: string; scientific: string | null } {
  const common = entry.commonName?.trim() || null;
  const scientific =
    common && common !== entry.canonicalName ? entry.canonicalName : null;
  return {
    primary: common || entry.canonicalName,
    scientific,
  };
}

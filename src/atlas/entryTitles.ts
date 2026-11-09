/** Primary display name (common) with optional distinct scientific subtitle. */
export function entryTitles(entry: {
  commonName: string | null;
  canonicalName: string;
}): { primary: string; scientific: string | null } {
  const common = entry.commonName?.trim() || null;
  return {
    primary: common || entry.canonicalName,
    scientific: common ? entry.canonicalName : null,
  };
}

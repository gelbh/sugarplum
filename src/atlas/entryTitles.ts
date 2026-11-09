/** Primary display name (common) with scientific fallback. */
export function entryTitles(entry: {
  commonName: string | null;
  canonicalName: string;
}): { primary: string; scientific: string } {
  const common = entry.commonName?.trim() || null;
  return {
    primary: common || entry.canonicalName,
    scientific: entry.canonicalName,
  };
}

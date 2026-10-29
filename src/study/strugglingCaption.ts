/** Caption bits for Insights / Today struggling rows (Again / Hard / Lapses / R%). */
export function formatStrugglingCaption(row: {
  again_14d: number;
  hard_14d: number;
  lapses: number;
  retrievability?: number | null;
}): string {
  const parts = [
    `Again (14d): ${row.again_14d}`,
    `Hard (14d): ${row.hard_14d}`,
    `Lapses: ${row.lapses}`,
  ];
  const r = row.retrievability;
  if (typeof r === "number" && Number.isFinite(r)) {
    parts.push(`R: ${Math.round(Math.min(1, Math.max(0, r)) * 100)}%`);
  }
  return parts.join(" · ");
}

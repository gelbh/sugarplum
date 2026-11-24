export function aggregateSubjectRecall(
  values: Array<number | null>,
): { avgRetrievability: number | null; etk: number; recallCardCount: number } {
  if (values.length === 0) {
    return { avgRetrievability: null, etk: 0, recallCardCount: 0 };
  }
  const rs = values.map((v) => v ?? 0);
  const etk = rs.reduce((a, b) => a + b, 0);
  return {
    avgRetrievability: etk / rs.length,
    etk,
    recallCardCount: rs.length,
  };
}

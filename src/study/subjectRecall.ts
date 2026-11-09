export function aggregateSubjectRecall(
  values: Array<number | null>,
): { avgRetrievability: number | null; etk: number } {
  const rs = values.filter((v): v is number => v != null);
  if (rs.length === 0) return { avgRetrievability: null, etk: 0 };
  const etk = rs.reduce((a, b) => a + b, 0);
  return { avgRetrievability: etk / rs.length, etk };
}

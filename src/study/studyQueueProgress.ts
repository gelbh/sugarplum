/** Percent of this loaded queue that has already left. 0 when `total` is empty. */
export function studyQueueProgress(total: number, remaining: number): number {
  if (total <= 0) return 0;
  const left = Math.min(total, Math.max(0, remaining));
  return ((total - left) / total) * 100;
}

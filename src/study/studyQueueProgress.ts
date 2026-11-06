export function studyQueueProgress(total: number, remaining: number): number {
  if (total <= 0) return 0;
  const left = Math.min(total, Math.max(0, remaining));
  return ((total - left) / total) * 100;
}

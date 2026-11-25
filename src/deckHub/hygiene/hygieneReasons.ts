const REASON_LABELS: Record<string, string> = {
  essay_back: "Essay answer",
  compound_front: "Compound prompt",
};

export function reasonLabel(reason: string): string {
  return (
    REASON_LABELS[reason] ??
    reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

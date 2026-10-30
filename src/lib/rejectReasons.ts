export const REJECT_REASONS = [
  "inaccurate",
  "vague",
  "not_atomic",
  "duplicate",
  "trivial",
] as const;

export type RejectReason = (typeof REJECT_REASONS)[number];

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  inaccurate: "Inaccurate",
  vague: "Too vague",
  not_atomic: "Not atomic",
  duplicate: "Duplicate",
  trivial: "Too trivial",
};

export function isRejectReason(value: unknown): value is RejectReason {
  return (
    typeof value === "string" &&
    (REJECT_REASONS as readonly string[]).includes(value)
  );
}

export type InsightsVerdictKind = "on_track" | "below_target";

export type InsightsVerdictStatus = {
  kind: InsightsVerdictKind;
  label: string;
};

/** Compare true retention % to desired retention % when both are known. */
export function insightsVerdictStatus(
  retentionPct: number | null,
  targetRetentionPct: number | null,
): InsightsVerdictStatus | null {
  if (
    retentionPct == null ||
    targetRetentionPct == null ||
    !Number.isFinite(retentionPct) ||
    !Number.isFinite(targetRetentionPct)
  ) {
    return null;
  }
  if (retentionPct >= targetRetentionPct) {
    return {
      kind: "on_track",
      label: `True retention on track vs ${targetRetentionPct}% target`,
    };
  }
  const delta = targetRetentionPct - retentionPct;
  return {
    kind: "below_target",
    label: `True retention ${delta} pts below ${targetRetentionPct}% target`,
  };
}

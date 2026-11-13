/** Jump bookkeeping key: pageCount + 0-based target index. */
export function stageJumpKey(
  pageCount: number,
  zeroBasedTarget: number,
): string {
  return `${pageCount}:${zeroBasedTarget}`;
}

/**
 * Whether Stage's current page should update the dialog (user scrub).
 * Suppress until the provenance jump has been applied and the skip window ends;
 * otherwise the initial index (0) races goToPage and looks like user nav.
 */
export function shouldReportStagePage(args: {
  claimedOneBased: number;
  stageOneBased: number;
  jumpAppliedKey: string;
  targetJumpKey: string;
  skipUntilMs: number;
  nowMs: number;
}): boolean {
  if (args.jumpAppliedKey === "") return false;
  if (args.jumpAppliedKey !== args.targetJumpKey) return false;
  if (args.nowMs < args.skipUntilMs) return false;
  if (args.stageOneBased === args.claimedOneBased) return false;
  if (
    !Number.isInteger(args.stageOneBased) ||
    args.stageOneBased < 1 ||
    !Number.isInteger(args.claimedOneBased) ||
    args.claimedOneBased < 1
  ) {
    return false;
  }
  return true;
}

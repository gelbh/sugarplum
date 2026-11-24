/** Soft-wait secondary line after short-term learning park. */
export function learningSoftWaitFollowUpCopy(pendingCount: number): string {
  const noun = pendingCount === 1 ? "card" : "cards";
  return `${pendingCount} short-term learning ${noun} still waiting in this session.`;
}

/** Extra honesty line when global due exists outside the session park. */
export function learningSoftWaitReadyDueCopy(readyDueCount: number): string {
  const noun = readyDueCount === 1 ? "card is" : "cards are";
  return `${readyDueCount} other ${noun} due now on Today.`;
}

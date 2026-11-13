/** Soft-wait secondary line after short-term learning park. */
export function learningSoftWaitFollowUpCopy(pendingCount: number): string {
  const noun = pendingCount === 1 ? "card" : "cards";
  return `Short-term follow-ups come back shortly. ${pendingCount} learning ${noun} still waiting.`;
}

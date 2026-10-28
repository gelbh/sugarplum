/** Display cap for Settings copy; keep in sync with worker FREE_GEN_DAILY_CAP. */
export const FREE_GEN_DAILY_CAP_DISPLAY = 20;

export function freeGenFaqBody(
  cap: number = FREE_GEN_DAILY_CAP_DISPLAY,
): string {
  return (
    `Free platform AI uses attempts, not credits. Each generation job counts ` +
    `toward ${cap} attempts per UTC day, including jobs that fail. Deleting a ` +
    `deck, rejecting drafts, or discarding cards does not restore attempts. ` +
    `The count resets at UTC midnight. Add your own API key to bypass this cap.`
  );
}

export function freeGenIntroBlurb(
  cap: number = FREE_GEN_DAILY_CAP_DISPLAY,
): string {
  return (
    `Optional. Without a key, Sugarplum uses free platform AI (up to ${cap} ` +
    `jobs per UTC day). Add your own OpenAI, Anthropic, or Google key to ` +
    `skip that cap and for higher quality. Keys are encrypted at rest and ` +
    `never shown in full again.`
  );
}

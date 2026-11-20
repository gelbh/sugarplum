export const LOADER_DELAY_MS = 900;

export function shouldShowDelayed(
  elapsedMs: number,
  delayMs: number = LOADER_DELAY_MS,
): boolean {
  return elapsedMs >= delayMs;
}

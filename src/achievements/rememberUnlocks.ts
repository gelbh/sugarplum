import type { UnlockView } from "./wire";

export function rememberUnlocks(
  prev: readonly UnlockView[],
  incoming: readonly UnlockView[],
): readonly UnlockView[] {
  const seen = new Set(prev.map((u) => u.id));
  const extra = incoming.filter((u) => u.id && !seen.has(u.id));
  return extra.length ? [...prev, ...extra] : prev;
}

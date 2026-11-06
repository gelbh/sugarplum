import type { UnlockView } from "./wire";

// A rolled-back Worker still returns unlock id strings instead of objects.
export function isUnlockView(u: unknown): u is UnlockView {
  if (typeof u !== "object" || u === null) return false;
  const v = u as Partial<UnlockView>;
  return (
    typeof v.title === "string" &&
    typeof v.fruitType === "string" &&
    v.traits != null
  );
}

export function rememberUnlocks(
  prev: readonly UnlockView[],
  incoming: readonly UnlockView[],
): readonly UnlockView[] {
  const seen = new Set(prev.map((u) => u.id));
  const extra = incoming.filter((u) => u.id && !seen.has(u.id));
  return extra.length ? [...prev, ...extra] : prev;
}

export function rememberIncomingUnlocks(
  prev: readonly UnlockView[],
  incoming: readonly unknown[],
): readonly UnlockView[] {
  const valid = incoming.filter(isUnlockView);
  return valid.length ? rememberUnlocks(prev, valid) : prev;
}

import type { AnatomyStructure } from "./types";

function sameRegionPool(
  structures: AnatomyStructure[],
  target: AnatomyStructure,
): AnatomyStructure[] {
  return structures.filter((s) => {
    if (s.id === target.id) return false;
    if (target.region == null || target.region === "") {
      return s.region == null || s.region === "";
    }
    return s.region === target.region;
  });
}

/** Sample up to `count` same-region distractors; inject `rng` for tests. */
export function pickMcqDistractors(
  structures: AnatomyStructure[],
  targetId: string,
  count: number,
  rng: () => number = Math.random,
): AnatomyStructure[] {
  if (count <= 0) return [];
  const target = structures.find((s) => s.id === targetId);
  if (!target) return [];

  const pool = sameRegionPool(structures, target);
  const n = Math.min(count, pool.length);
  if (n === 0) return [];

  // Partial Fisher–Yates: shuffle only the first n slots.
  const copy = pool.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (copy.length - i));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy.slice(0, n);
}

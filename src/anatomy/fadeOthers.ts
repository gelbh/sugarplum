/** Spec band 0.12–0.25; tune in FR without a new design if still in band. */
export const FADE_OTHERS_OPACITY = 0.18;
export const FADE_OTHERS_MAX = 64;

export type FadeCandidate = {
  id: string;
  distanceSq: number;
};

export function selectFadeIds(
  candidates: FadeCandidate[],
  maxCount: number = FADE_OTHERS_MAX,
): string[] {
  return [...candidates]
    .sort((a, b) => a.distanceSq - b.distanceSq)
    .slice(0, Math.max(0, maxCount))
    .map((c) => c.id);
}

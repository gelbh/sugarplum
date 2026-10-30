import type { FruitTraits, Shine } from "./traits";

const SHINE: Record<Shine, { b: number; s: number }> = {
  low: { b: 0.92, s: 0.86 },
  mild: { b: 0.96, s: 0.92 },
  high: { b: 1.02, s: 1.06 },
  very_high: { b: 1.06, s: 1.12 },
  max: { b: 1.1, s: 1.18 },
};

const COLOUR: Record<string, { b: number; s: number }> = {
  dull: { b: 0.88, s: 0.78 },
  muted: { b: 0.94, s: 0.84 },
  clearer: { b: 1.02, s: 0.96 },
  soft: { b: 0.98, s: 0.92 },
  bright: { b: 1.04, s: 1.06 },
  vivid_soft: { b: 1.02, s: 1.08 },
  vivid: { b: 1.03, s: 1.12 },
  rich: { b: 1.02, s: 1.14 },
  signature: { b: 1.04, s: 1.16 },
  golden: { b: 1.08, s: 1.12 },
};

const STATUS: Record<string, { b: number; s: number; c: number }> = {
  bruised: { b: 0.86, s: 0.9, c: 0.96 },
  unripe: { b: 0.94, s: 0.72, c: 1 },
  edible: { b: 1, s: 1, c: 1 },
  firm: { b: 0.98, s: 0.98, c: 1.03 },
  ripe: { b: 1.02, s: 1.05, c: 1 },
  juicy: { b: 1.04, s: 1.06, c: 1 },
  glossy: { b: 1.06, s: 1.04, c: 1.05 },
  perfect: { b: 1.05, s: 1.08, c: 1.04 },
  flawless: { b: 1.07, s: 1.1, c: 1.06 },
};

export function cssFilterFromTraits(
  traits: FruitTraits,
  opts?: { locked?: boolean; ripen?: boolean },
): string {
  if (opts?.locked && !opts?.ripen) {
    return "brightness(0.55) saturate(0.35)";
  }
  const shine = SHINE[traits.shine] ?? SHINE.low;
  const colour = COLOUR[traits.colour] ?? { b: 1, s: 1 };
  const status = STATUS[traits.status] ?? { b: 1, s: 1, c: 1 };
  const b = shine.b * colour.b * status.b;
  const s = shine.s * colour.s * status.s;
  const c = status.c;
  return `brightness(${b.toFixed(3)}) saturate(${s.toFixed(3)}) contrast(${c.toFixed(3)})`;
}

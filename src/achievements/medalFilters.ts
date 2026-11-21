import type { FruitTraits, Shine } from "./traits";

type ColourTone = { b: number; s: number; hue?: number; sepia?: number };

const SHINE: Record<Shine, { b: number; s: number }> = {
  low: { b: 0.88, s: 0.8 },
  mild: { b: 0.94, s: 0.9 },
  high: { b: 1.04, s: 1.1 },
  very_high: { b: 1.1, s: 1.18 },
  max: { b: 1.16, s: 1.26 },
};

const COLOUR: Record<string, ColourTone> = {
  dull: { b: 0.84, s: 0.7, sepia: 0.18 },
  muted: { b: 0.9, s: 0.78, sepia: 0.1 },
  clearer: { b: 1.02, s: 0.96 },
  soft: { b: 0.98, s: 0.92 },
  bright: { b: 1.05, s: 1.1 },
  vivid_soft: { b: 1.03, s: 1.12 },
  vivid: { b: 1.04, s: 1.16 },
  rich: { b: 1.03, s: 1.18 },
  signature: { b: 1.06, s: 1.2, hue: -12 },
  golden: { b: 1.12, s: 1.2, sepia: 0.45, hue: 28 },
};

const STATUS: Record<string, { b: number; s: number; c: number }> = {
  bruised: { b: 0.82, s: 0.86, c: 0.94 },
  unripe: { b: 0.92, s: 0.68, c: 1 },
  edible: { b: 1, s: 1, c: 1 },
  firm: { b: 0.98, s: 0.98, c: 1.03 },
  ripe: { b: 1.03, s: 1.06, c: 1 },
  juicy: { b: 1.05, s: 1.08, c: 1 },
  glossy: { b: 1.07, s: 1.06, c: 1.05 },
  perfect: { b: 1.07, s: 1.1, c: 1.05 },
  flawless: { b: 1.09, s: 1.12, c: 1.07 },
};

export function cssFilterFromTraits(
  traits: FruitTraits,
  opts?: { locked?: boolean },
): string {
  if (opts?.locked) {
    // Soft silhouette: readable shape, not crushed black fruit.
    return "brightness(0.78) saturate(0.22) contrast(0.92)";
  }
  const shine = SHINE[traits.shine] ?? SHINE.low;
  const colour = COLOUR[traits.colour] ?? { b: 1, s: 1 };
  const status = STATUS[traits.status] ?? { b: 1, s: 1, c: 1 };
  const b = shine.b * colour.b * status.b;
  const s = shine.s * colour.s * status.s;
  const c = status.c;
  const parts = [
    `brightness(${b.toFixed(3)})`,
    `saturate(${s.toFixed(3)})`,
    `contrast(${c.toFixed(3)})`,
  ];
  if (colour.sepia) parts.push(`sepia(${colour.sepia.toFixed(2)})`);
  if (colour.hue) parts.push(`hue-rotate(${colour.hue}deg)`);
  return parts.join(" ");
}

export type OcclusionNormBox = { x: number; y: number; w: number; h: number };

/** Scroll offset so the mask center sits in the middle of the shell. */
export function occlusionMaskScrollTop(
  mask: OcclusionNormBox,
  contentH: number,
  shellH: number,
): number {
  if (!(contentH > 0) || !(shellH > 0)) return 0;
  const centerY = (mask.y + mask.h / 2) * contentH;
  const maxScroll = Math.max(0, contentH - shellH);
  return Math.min(maxScroll, Math.max(0, centerY - shellH / 2));
}

/** Scale + origin so a tile viewport focuses the padded mask. */
export function occlusionTileFocusTransform(
  mask: OcclusionNormBox,
  opts?: { pad?: number; maxScale?: number },
): { transformOrigin: string; transform: string } {
  const pad = opts?.pad ?? 0.12;
  const maxScale = opts?.maxScale ?? 4;
  const cx = (mask.x + mask.w / 2) * 100;
  const cy = (mask.y + mask.h / 2) * 100;
  const bw = Math.max(mask.w + pad * 2, 1e-6);
  const bh = Math.max(mask.h + pad * 2, 1e-6);
  const scale = Math.min(maxScale, Math.max(1, 1 / bw, 1 / bh));
  const rounded = Math.round(scale * 1000) / 1000;
  return {
    transformOrigin: `${roundPct(cx)}% ${roundPct(cy)}%`,
    transform: `scale(${rounded})`,
  };
}

function roundPct(n: number): number {
  return Math.round(n * 100) / 100;
}

type Matrix6 = readonly [number, number, number, number, number, number];

export type TextRun = {
  str: string;
  width: number;
  height: number;
  transform: Matrix6;
};

type ExcerptRect = { x: number; y: number; w: number; h: number };

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Same product as PDF.js `Util.transform`, with the viewport matrix first. */
function transform(viewport: Matrix6, item: Matrix6): Matrix6 {
  return [
    viewport[0] * item[0] + viewport[2] * item[1],
    viewport[1] * item[0] + viewport[3] * item[1],
    viewport[0] * item[2] + viewport[2] * item[3],
    viewport[1] * item[2] + viewport[3] * item[3],
    viewport[0] * item[4] + viewport[2] * item[5] + viewport[4],
    viewport[1] * item[4] + viewport[3] * item[5] + viewport[5],
  ];
}

/**
 * Glyph box in viewport space: PDF.js width stays device-space; height comes
 * from the transformed vertical span; y is top (baseline minus that height).
 */
function glyphRect(item: TextRun, viewport: Matrix6): ExcerptRect {
  const m = transform(viewport, item.transform);
  const span = Math.hypot(m[2], m[3]);
  const h = span === 0 ? item.height : span;
  return {
    x: m[4],
    y: m[5] - h,
    w: item.width,
    h,
  };
}

export function excerptHighlightRects(
  items: readonly TextRun[],
  excerpt: string,
  viewportTransform: Matrix6,
): ExcerptRect[] {
  const needle = normalize(excerpt);
  if (!needle) return [];

  const spans: { item: TextRun; start: number; end: number }[] = [];
  let joined = "";
  for (const item of items) {
    const text = normalize(item.str);
    if (!text) continue;
    if (joined.length > 0) joined += " ";
    const start = joined.length;
    joined += text;
    spans.push({ item, start, end: joined.length });
  }

  const matchStart = joined.indexOf(needle);
  if (matchStart < 0) return [];
  const matchEnd = matchStart + needle.length;

  return spans
    .filter((span) => span.start < matchEnd && span.end > matchStart)
    .map((span) => glyphRect(span.item, viewportTransform));
}

export const MAX_REGIONS = 8;
export const MIN_AREA_FRACTION = 0.0004;
export const MIN_CONFIDENCE = 40;
/** Symmetric padding in pixels around merged label boxes. */
export const BOX_PADDING_PX = 4;
/**
 * Max horizontal gap between words on a line as a multiple of the shorter
 * word height. Wider gaps keep separate labels on the same band.
 */
export const HORIZONTAL_MERGE_FACTOR = 1.5;
/**
 * Max vertical gap between line boxes as a multiple of the shorter line height.
 * Nearby lines (e.g. stacked labels) merge into one region.
 */
export const VERTICAL_MERGE_FACTOR = 0.8;

export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type MappedOcclusionRegion = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
};

type PixelBox = { x0: number; y0: number; x1: number; y1: number };

type LabelBox = {
  label: string;
  box: PixelBox;
};

/** Trim and strip incidental punctuation; keep alnum-adjacent +/- (e.g. Na+, -5). */
function cleanOcrLabel(text: string): string {
  return text
    .trim()
    .replace(/^[^\p{L}\p{N}+\-]+/u, "")
    .replace(/[^\p{L}\p{N}+\-]+$/u, "");
}

function clampPixelBox(
  bbox: OcrWord["bbox"],
  imageWidth: number,
  imageHeight: number,
): PixelBox {
  const x0 = Math.max(0, Math.min(bbox.x0, bbox.x1, imageWidth));
  const x1 = Math.max(0, Math.min(Math.max(bbox.x0, bbox.x1), imageWidth));
  const y0 = Math.max(0, Math.min(bbox.y0, bbox.y1, imageHeight));
  const y1 = Math.max(0, Math.min(Math.max(bbox.y0, bbox.y1), imageHeight));
  return { x0, y0, x1, y1 };
}

function boxHeight(box: PixelBox): number {
  return Math.max(0, box.y1 - box.y0);
}

function boxWidth(box: PixelBox): number {
  return Math.max(0, box.x1 - box.x0);
}

function unionBox(a: PixelBox, b: PixelBox): PixelBox {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function padBox(
  box: PixelBox,
  imageWidth: number,
  imageHeight: number,
): PixelBox {
  return clampPixelBox(
    {
      x0: box.x0 - BOX_PADDING_PX,
      y0: box.y0 - BOX_PADDING_PX,
      x1: box.x1 + BOX_PADDING_PX,
      y1: box.y1 + BOX_PADDING_PX,
    },
    imageWidth,
    imageHeight,
  );
}

/** Same line when vertical centers sit within half the taller word height. */
function onSameLine(a: PixelBox, b: PixelBox): boolean {
  const midA = (a.y0 + a.y1) / 2;
  const midB = (b.y0 + b.y1) / 2;
  const tol = Math.max(boxHeight(a), boxHeight(b)) / 2;
  return Math.abs(midA - midB) <= tol;
}

function groupIntoLines(words: LabelBox[]): LabelBox[][] {
  const lines: LabelBox[][] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last && onSameLine(last[0]!.box, word.box)) {
      last.push(word);
    } else {
      lines.push([word]);
    }
  }
  return lines;
}

function shouldMergeHorizontally(a: PixelBox, b: PixelBox): boolean {
  const gap = b.x0 - a.x1;
  if (gap < 0) return true;
  const limit =
    HORIZONTAL_MERGE_FACTOR * Math.min(boxHeight(a), boxHeight(b));
  return gap <= limit;
}

/** Merge horizontally adjacent words; leave distant same-band labels apart. */
function mergeLine(words: LabelBox[]): LabelBox[] {
  const sorted = [...words].sort((a, b) => a.box.x0 - b.box.x0);
  if (sorted.length === 0) return [];
  const clusters: LabelBox[] = [
    { label: sorted[0]!.label, box: { ...sorted[0]!.box } },
  ];
  for (let i = 1; i < sorted.length; i++) {
    const prev = clusters[clusters.length - 1]!;
    const next = sorted[i]!;
    if (shouldMergeHorizontally(prev.box, next.box)) {
      prev.box = unionBox(prev.box, next.box);
      prev.label = `${prev.label} ${next.label}`;
    } else {
      clusters.push({ label: next.label, box: { ...next.box } });
    }
  }
  return clusters;
}

function horizontalOverlap(a: PixelBox, b: PixelBox): boolean {
  return Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0);
}

function shouldMergeVertically(a: PixelBox, b: PixelBox): boolean {
  if (!horizontalOverlap(a, b)) return false;
  const gap = b.y0 - a.y1;
  if (gap < 0) return true;
  const limit =
    VERTICAL_MERGE_FACTOR * Math.min(boxHeight(a), boxHeight(b));
  return gap <= limit;
}

function mergeVerticalLines(lines: LabelBox[]): LabelBox[] {
  if (lines.length === 0) return [];
  const merged: LabelBox[] = [{ ...lines[0]!, box: { ...lines[0]!.box } }];
  for (let i = 1; i < lines.length; i++) {
    const cur = lines[i]!;
    let attached = false;
    for (let j = merged.length - 1; j >= 0; j--) {
      const prev = merged[j]!;
      if (shouldMergeVertically(prev.box, cur.box)) {
        prev.box = unionBox(prev.box, cur.box);
        prev.label = `${prev.label} ${cur.label}`;
        attached = true;
        break;
      }
    }
    if (!attached) {
      merged.push({ ...cur, box: { ...cur.box } });
    }
  }
  return merged;
}

export function mapOcrWordsToRegions(
  words: OcrWord[],
  imageWidth: number,
  imageHeight: number,
): MappedOcclusionRegion[] {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return [];
  }

  const imageArea = imageWidth * imageHeight;
  const minArea = MIN_AREA_FRACTION * imageArea;

  const candidates = words
    .filter((w) => w.confidence >= MIN_CONFIDENCE)
    .map((w) => {
      const label = cleanOcrLabel(w.text);
      const box = clampPixelBox(w.bbox, imageWidth, imageHeight);
      return { label, box, pixelArea: boxWidth(box) * boxHeight(box) };
    })
    .filter((c) => c.label.length >= 1 && c.pixelArea >= minArea);

  candidates.sort((a, b) => {
    if (a.box.y0 !== b.box.y0) {
      return a.box.y0 - b.box.y0;
    }
    return a.box.x0 - b.box.x0;
  });

  const lineBoxes = groupIntoLines(candidates).flatMap(mergeLine);
  // Re-sort after horizontal clustering so vertical merge walks top→bottom.
  lineBoxes.sort((a, b) => {
    if (a.box.y0 !== b.box.y0) return a.box.y0 - b.box.y0;
    return a.box.x0 - b.box.x0;
  });
  const merged = mergeVerticalLines(lineBoxes);
  merged.sort((a, b) => {
    if (a.box.y0 !== b.box.y0) return a.box.y0 - b.box.y0;
    return a.box.x0 - b.box.x0;
  });

  return merged.slice(0, MAX_REGIONS).map((c, index) => {
    const box = padBox(c.box, imageWidth, imageHeight);
    const x = box.x0 / imageWidth;
    const y = box.y0 / imageHeight;
    const w = boxWidth(box) / imageWidth;
    const h = boxHeight(box) / imageHeight;
    return {
      id: `r${index + 1}`,
      x,
      y,
      w,
      h,
      label: c.label,
    };
  });
}

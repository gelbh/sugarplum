export const MAX_REGIONS = 8;
export const MIN_AREA_FRACTION = 0.0004;
export const MIN_CONFIDENCE = 40;

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

function cleanOcrLabel(text: string): string {
  return text
    .trim()
    .replace(/^[\p{P}\p{S}\s]+/u, "")
    .replace(/[\p{P}\p{S}\s]+$/u, "");
}

function clampPixelBox(
  bbox: OcrWord["bbox"],
  imageWidth: number,
  imageHeight: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = Math.max(0, Math.min(bbox.x0, bbox.x1, imageWidth));
  const x1 = Math.max(0, Math.min(Math.max(bbox.x0, bbox.x1), imageWidth));
  const y0 = Math.max(0, Math.min(bbox.y0, bbox.y1, imageHeight));
  const y1 = Math.max(0, Math.min(Math.max(bbox.y0, bbox.y1), imageHeight));
  return { x0, y0, x1, y1 };
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
      const pw = box.x1 - box.x0;
      const ph = box.y1 - box.y0;
      return { label, box, pixelArea: pw * ph };
    })
    .filter((c) => c.label.length >= 1 && c.pixelArea >= minArea);

  candidates.sort((a, b) => {
    if (a.box.y0 !== b.box.y0) {
      return a.box.y0 - b.box.y0;
    }
    return a.box.x0 - b.box.x0;
  });

  return candidates.slice(0, MAX_REGIONS).map((c, index) => {
    const x = c.box.x0 / imageWidth;
    const y = c.box.y0 / imageHeight;
    const w = (c.box.x1 - c.box.x0) / imageWidth;
    const h = (c.box.y1 - c.box.y0) / imageHeight;
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

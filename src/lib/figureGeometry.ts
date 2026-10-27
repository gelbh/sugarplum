export type PageBox = {
  pageIndex: number; // 0-based
  x: number; // CSS px relative to canvas client box
  y: number;
  w: number;
  h: number;
  score: number;
  label: string;
};

export const FIGURE_LABELS = new Set(["figure", "image", "chart", "picture"]);
export const MIN_BOX_SCORE = 0.4;
export const MIN_BOX_AREA_FRACTION = 0.01;
export const MAX_PAGES_TO_SCAN = 15;
export const MAX_CLIENT_FIGURES = 20;

export function canvasSourceScale(canvas: {
  width: number;
  clientWidth: number;
}): number {
  return canvas.width / canvas.clientWidth;
}

export function filterFigureBoxes(
  boxes: PageBox[],
  pageCssWidth: number,
  pageCssHeight: number,
): PageBox[] {
  const pageArea = pageCssWidth * pageCssHeight;
  return boxes
    .filter(
      (box) =>
        FIGURE_LABELS.has(box.label) &&
        box.score >= MIN_BOX_SCORE &&
        (box.w * box.h) / pageArea >= MIN_BOX_AREA_FRACTION,
    )
    .sort((a, b) => b.score - a.score);
}

export function clampBoxToPage(
  box: PageBox,
  pageCssWidth: number,
  pageCssHeight: number,
): PageBox {
  const x = Math.max(0, Math.min(box.x, pageCssWidth));
  const y = Math.max(0, Math.min(box.y, pageCssHeight));
  const right = Math.max(x, Math.min(box.x + box.w, pageCssWidth));
  const bottom = Math.max(y, Math.min(box.y + box.h, pageCssHeight));
  return {
    ...box,
    x,
    y,
    w: right - x,
    h: bottom - y,
  };
}

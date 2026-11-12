export const NOTES_ZOOM_MIN = 0.5;
export const NOTES_ZOOM_MAX = 4;
export const NOTES_ZOOM_STEP = 0.25;
export const NOTES_ZOOM_FIT = 1;
/** Cap CSS render width so zoom × DPR cannot allocate huge canvases. */
export const NOTES_RENDER_CSS_MAX = 2000;

export function clampNotesZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return NOTES_ZOOM_FIT;
  return Math.min(NOTES_ZOOM_MAX, Math.max(NOTES_ZOOM_MIN, zoom));
}

export function stepNotesZoom(zoom: number, direction: 1 | -1): number {
  return clampNotesZoom(clampNotesZoom(zoom) + direction * NOTES_ZOOM_STEP);
}

/**
 * CSS pixel width for pdf.js canvas render: floor(fitWidth * zoom), capped.
 * Invalid fit width → 1 so render still has a positive target.
 */
export function notesRenderCssWidth(fitWidth: number, zoom: number): number {
  if (!Number.isFinite(fitWidth) || fitWidth < 1) return 1;
  const scaled = Math.floor(fitWidth * clampNotesZoom(zoom));
  return Math.min(NOTES_RENDER_CSS_MAX, Math.max(1, scaled));
}

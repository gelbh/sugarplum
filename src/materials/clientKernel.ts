/**
 * Client-only materials public surface (PDF engine, OCR, figure geometry).
 * Do not import from the CF worker graph. Cycle-safe for peers that cannot
 * use the React materials index barrel.
 */
export {
  getEmbedPdfEngine,
  openPdfDocument,
  listPdfPages,
  renderPageToCanvas,
  renderPageToCanvasAtScale,
  pageLayoutForNumber,
  pagePlainText,
  copyPdfBytes,
  type EmbedPdfDocument,
  type EmbedPdfPageLayout,
} from "./embedPdfEngine";
export {
  OCR_EMPTY_PAGE_LIMIT,
  OCR_TEXT_LAYER_SCAN_LIMIT,
  ocrEmptyPdfPages,
  ocrEmptyPdfPagesInWindow,
  type PageText,
} from "./pdfScanOcr";
export {
  FIGURE_LABELS,
  MAX_CLIENT_FIGURES,
  MAX_PAGES_TO_SCAN,
  MIN_BOX_AREA_FRACTION,
  MIN_BOX_SCORE,
  canvasSourceScale,
  clampBoxToPage,
  filterFigureBoxes,
  type PageBox,
} from "./figureGeometry";

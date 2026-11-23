/**
 * Cycle-safe materials public surface for api/types and peer domains that
 * cannot import the React index barrel (materials↔deckHub↔study).
 * Includes pdfScanOcr (canvas/DOM); do not import from the CF worker graph.
 * Keep this thin: pure helpers + OCR/api only (no React workshop UI).
 */
export {
  SOURCE_ROLES,
  SOURCE_ROLE_LABELS,
  isSourceRole,
  suggestSourceRole,
  type SourceRole,
} from "./sourceRole";
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
export {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_SPLIT_SOURCE_BYTES,
  fileSizeCapMb,
  fileTooLargeMessage,
  splitSourceTooLargeMessage,
  type SplitSourceKind,
} from "./materialUploadLimits";
export { storedUploadNotice, batchAllReused } from "./storedUploadNotice";

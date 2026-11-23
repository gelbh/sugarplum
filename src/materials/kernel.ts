/**
 * Materials public surface for api/types without the React index barrel.
 * Includes pdfScanOcr (canvas/DOM); do not import from the CF worker graph.
 */
export {
  SOURCE_ROLES,
  SOURCE_ROLE_LABELS,
  isSourceRole,
  suggestSourceRole,
  type SourceRole,
} from "./sourceRole";
export {
  OCR_EMPTY_PAGE_LIMIT,
  OCR_TEXT_LAYER_SCAN_LIMIT,
  ocrEmptyPdfPages,
  ocrEmptyPdfPagesInWindow,
  type PageText,
} from "./pdfScanOcr";

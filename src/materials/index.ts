export { default as CreateMaterialStepper } from "./CreateMaterialStepper";
export { default as MaterialRow } from "./MaterialRow";
export { default as MaterialsList } from "./MaterialsList";
export { default as OperateSection } from "./OperateSection";
export { default as PdfCompressConsent } from "./PdfCompressConsent";
export { default as PdfSplitConsent } from "./PdfSplitConsent";
export { default as PptxSplitConsent } from "./PptxSplitConsent";
export {
  default as CompositionSpark,
  COMPOSITION_SEGMENT_COLORS,
  type CompositionSparkProps,
} from "./CompositionSpark";
export { stepperSx } from "./stepperSx";
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
  compressPdfUnderLimit,
  type CompressPdfOk,
  type CompressPdfErr,
} from "./compressPdfUnderLimit";
export {
  splitPdfUnderLimit,
  type SplitPdfOk,
  type SplitPdfErr,
} from "./splitPdfUnderLimit";
export {
  splitPptxUnderLimit,
  type SplitPptxOk,
  type SplitPptxErr,
} from "./splitPptxUnderLimit";
export { runConsentedPdfCompressUpload } from "./runConsentedPdfCompressUpload";
export { runConsentedPdfSplitUpload } from "./runConsentedPdfSplitUpload";
export { runConsentedPptxSplitUpload } from "./runConsentedPptxSplitUpload";
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
export {
  formatSplitPartFilename,
  parseSplitPartFilename,
  type SplitPartName,
} from "./splitPartFilename";
export {
  DIY_OCCLUSION_FREE_PATH_NOTICE,
  FREE_PATH_IMAGE_HELPER,
  CREATE_FREE_PATH_IMAGE_NOTICE,
  isImageUploadContentType,
  shouldOfferLearningObjectives,
  freePathImageHelperText,
  uploadSubmitLabel,
  uploadSubmitDisabled,
  diyOcclusionNotice,
  createFreePathImageNotice,
} from "./learningObjectivesOffer";
export {
  SOURCE_ROLES,
  SOURCE_ROLE_LABELS,
  isSourceRole,
  suggestSourceRole,
  type SourceRole,
} from "./sourceRole";
export { SOURCE_ROLE_ICONS } from "./sourceRoleIcons";
export {
  OCR_EMPTY_PAGE_LIMIT,
  OCR_TEXT_LAYER_SCAN_LIMIT,
  ocrEmptyPdfPages,
  ocrEmptyPdfPagesInWindow,
  type PageText,
} from "./pdfScanOcr";

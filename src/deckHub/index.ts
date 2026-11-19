export { default as CoverPickerDialog } from "./CoverPickerDialog";
export { default as CoverPickerPanel } from "./CoverPickerPanel";
export { default as EmptyNext } from "./EmptyNext";
export { default as HubNavCard } from "./HubNavCard";
export {
  default as DraftCardEditor,
  resolveEditorType,
  type DraftEditorChange,
  type DraftPreviewFace,
  type DraftCardEditorProps,
} from "./DraftCardEditor";
export {
  FigureSuggestPanel,
  type FigureSuggestPanelProps,
} from "./FigureSuggestPanel";
export {
  default as OcclusionRegionEditor,
  type OcclusionRegion,
  type OcclusionRegionEditorProps,
} from "./OcclusionRegionEditor";
export {
  hubDiyTypes,
  collectDeckImageKeys,
  validateHubCreateCard,
  type HubCreateValidation,
} from "./hubDiyCreate";
export {
  MCQ_MIN,
  MCQ_MAX,
  mcqBack,
  pickCorrect,
  correctIndexFor,
  withMcqOptionText,
  withMcqCorrect,
  withMcqOptionAdded,
  withMcqOptionRemoved,
  type McqDraft,
} from "./mcqDraftEdit";
export {
  occlusionMaskScrollTop,
  occlusionTileFocusTransform,
  type OcclusionMaskBox,
} from "./occlusionLayout";
export {
  ensureLayoutSession,
  detectFigureBoxesOnCanvas,
  letterboxRgbaToChw,
  mapLetterboxBoxToCss,
  parseLayoutDetections,
  resetLayoutSessionForTests,
  type LayoutLoadResult,
  type LabelsConfig,
  type LetterboxMeta,
  type ParsedDetection,
  type DetectFigureResult,
} from "./layoutOnnx";
export {
  MAX_IMAGE_BYTES,
  cssRectToSourceRect,
  assertWithinImageByteLimit,
  cropCanvasToPngFile,
} from "./pdfPageRender";
export {
  suggestOcclusionRegions,
  flattenBlocksToWords,
  resetOcrWorkerForTests,
} from "./occlusionOcr";
export {
  MAX_REGIONS,
  MIN_AREA_FRACTION,
  MIN_CONFIDENCE,
  BOX_PADDING_PX,
  HORIZONTAL_MERGE_FACTOR,
  VERTICAL_MERGE_FACTOR,
  mapOcrWordsToRegions,
  type OcrWord,
  type MappedOcclusionRegion,
} from "./occlusionOcrMap";

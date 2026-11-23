/**
 * Cycle-safe materials public surface for api/types, atlas hub, and peers that
 * cannot import the React index barrel (materials↔deckHub↔study).
 * Pure helpers only (no OCR/DOM/PDF engine). Worker-safe.
 * Client OCR/PDF: import from ./clientKernel.
 */
export {
  SOURCE_ROLES,
  SOURCE_ROLE_LABELS,
  isSourceRole,
  suggestSourceRole,
  type SourceRole,
} from "./sourceRole";
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

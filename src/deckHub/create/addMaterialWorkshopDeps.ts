/**
 * Injected materials helpers for Add Material workshop (composed at routes).
 * Structural types only — no materials leaf imports (boundary cycle).
 */

export type AddMaterialLearningObjectives = {
  diyOcclusionNotice: (args: { hadLearningObjectives: boolean }) => string;
  freePathImageHelperText: (args: {
    isImage: boolean;
    llmConfigured: boolean | null;
  }) => string | null;
  isImageUploadContentType: (contentType: string) => boolean;
  shouldOfferLearningObjectives: (args: {
    isImage: boolean;
    llmConfigured: boolean | null;
  }) => boolean;
  uploadSubmitDisabled: (args: {
    isImage: boolean;
    llmConfigured: boolean | null;
    busy: boolean;
  }) => boolean;
  uploadSubmitLabel: (args: {
    isImage: boolean;
    llmConfigured: boolean | null;
  }) => "Continue" | "Start generation";
};

/** Wide structural runners; routes pass materials implementations. */
export type AddMaterialConsentedUploads = {
  // ponytail: avoid importing materials leaf types into deckHub; widen to any result.
  runConsentedPdfCompressUpload: (args: {
    file: File;
    maxBytes: number;
    figureFiles: File[];
    onProgress: (label: string) => void;
    uploadPart: (
      part: File,
      figuresForThisPart: File[],
    ) => Promise<Record<string, unknown>>;
  }) => Promise<
    | { ok: false; message: string }
    | {
        ok: true;
        file: File;
        material: {
          manual_occlusion?: boolean;
          r2_key?: string | null;
          reused?: boolean;
          status?: string;
        };
        lastJobId: string | null;
        lastStatus: string;
      }
  >;
  runConsentedPdfSplitUpload: (args: {
    file: File;
    maxBytes: number;
    figureFiles: File[];
    onProgress: (label: string) => void;
    uploadPart: (
      part: File,
      figuresForThisPart: File[],
    ) => Promise<Record<string, unknown>>;
  }) => Promise<
    | { ok: false; message: string; next?: "compress" }
    | {
        ok: true;
        parts: unknown[];
        lastJobId: string | null;
        lastStatus: string;
        skippedFigures: boolean;
        materials: Array<{
          manual_occlusion?: boolean;
          r2_key?: string | null;
          reused?: boolean;
        }>;
      }
  >;
  runConsentedPptxSplitUpload: (args: {
    file: File;
    maxBytes: number;
    onProgress: (label: string) => void;
    uploadPart: (part: File) => Promise<Record<string, unknown>>;
  }) => Promise<
    | { ok: false; message: string }
    | {
        ok: true;
        parts: unknown[];
        lastJobId: string | null;
        lastStatus: string;
        materials: Array<{
          manual_occlusion?: boolean;
          r2_key?: string | null;
          reused?: boolean;
        }>;
      }
  >;
};

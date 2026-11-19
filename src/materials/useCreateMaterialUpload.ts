import {
  useEffect,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  ApiError,
  getLlmSettings,
  PPTX_MIME,
  resolveUploadContentType,
  topicHintsFromLines,
  uploadMaterialFile,
  uploadPdfWithFigureCrops,
  type FigureExtractMode,
} from "../api/client";
import { MAX_CLIENT_FIGURES } from "./figureGeometry";
import {
  createFreePathImageNotice,
  freePathImageHelperText,
  isImageUploadContentType,
  shouldOfferLearningObjectives,
  uploadSubmitDisabled,
  uploadSubmitLabel,
} from "./learningObjectivesOffer";
import {
  batchAllReused,
  storedUploadNotice,
} from "./storedUploadNotice";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_SPLIT_SOURCE_BYTES,
  fileTooLargeMessage,
  splitSourceTooLargeMessage,
} from "./materialUploadLimits";
import { runConsentedPdfCompressUpload } from "./runConsentedPdfCompressUpload";
import { runConsentedPdfSplitUpload } from "./runConsentedPdfSplitUpload";
import { runConsentedPptxSplitUpload } from "./runConsentedPptxSplitUpload";
import type { SourceRole } from "../lib/sourceRole";
import {
  ALLOWED_UPLOAD_MIMES,
  FIGURES_SKIPPED_NOTICE,
  IMAGE_MIMES,
} from "./createMaterialConstants";

type Args = {
  selectedDeckId: string;
  alsoCover: string;
  setAlsoCover: Dispatch<SetStateAction<string>>;
  sourceRole: SourceRole;
  setSourceRole: Dispatch<SetStateAction<SourceRole>>;
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setActiveStep: (n: number) => void;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setJobId: Dispatch<SetStateAction<string | null>>;
  setJobReused: Dispatch<SetStateAction<boolean>>;
  setReadingScan: Dispatch<SetStateAction<boolean>>;
};

export function useCreateMaterialUpload({
  selectedDeckId,
  alsoCover,
  setAlsoCover,
  sourceRole,
  setSourceRole,
  busy,
  setBusy,
  setActiveStep,
  setError,
  setNotice,
  setJobId,
  setJobReused,
  setReadingScan,
}: Args) {
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [figureFiles, setFigureFiles] = useState<File[]>([]);
  const [figureExtractMode, setFigureExtractMode] =
    useState<FigureExtractMode>("fast");
  const [pdfSplitOpen, setPdfSplitOpen] = useState(false);
  const [pdfSplitProgress, setPdfSplitProgress] = useState<string | null>(null);
  const [pptxSplitOpen, setPptxSplitOpen] = useState(false);
  const [pptxSplitProgress, setPptxSplitProgress] = useState<string | null>(
    null,
  );
  const [pdfCompressOpen, setPdfCompressOpen] = useState(false);
  const [pdfCompressProgress, setPdfCompressProgress] = useState<string | null>(
    null,
  );
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLlmSettings()
      .then((s) => {
        if (!cancelled) setLlmConfigured(s.configured);
      })
      .catch(() => {
        if (!cancelled) setLlmConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const contentTypeForOffer = uploadFile
    ? resolveUploadContentType(uploadFile)
    : "";
  const isImage =
    Boolean(uploadFile) && isImageUploadContentType(contentTypeForOffer);
  const offerLearningObjectives = shouldOfferLearningObjectives({
    isImage,
    llmConfigured,
  });
  const submitLabel = uploadSubmitLabel({ isImage, llmConfigured });
  const freePathImageHelper = freePathImageHelperText({
    isImage,
    llmConfigured,
  });
  const submitDisabled = uploadSubmitDisabled({
    isImage,
    llmConfigured,
    busy,
  });

  useEffect(() => {
    if (isImage && !offerLearningObjectives && alsoCover) {
      setAlsoCover("");
    }
  }, [isImage, offerLearningObjectives, alsoCover, setAlsoCover]);

  function freePathNoJobNotice(args: {
    hadLearningObjectives: boolean;
    manualOcclusion?: boolean;
    status: string;
  }): string {
    if (args.manualOcclusion) {
      return createFreePathImageNotice({
        hadLearningObjectives: args.hadLearningObjectives,
      });
    }
    return `Stored file (${args.status}). Open drafts from a prior generate, or upload a new file.`;
  }

  function onPdfSplitCancel() {
    if (busy) return;
    setPdfSplitOpen(false);
    setPdfSplitProgress(null);
  }

  function onPptxSplitCancel() {
    if (busy) return;
    setPptxSplitOpen(false);
    setPptxSplitProgress(null);
  }

  function clearUploadForm() {
    setUploadFile(null);
    setFigureFiles([]);
    setSourceRole("lecture");
    setAlsoCover("");
  }

  function uploadPdfPart(part: File, figuresForThisPart: File[]) {
    if (!selectedDeckId) {
      return Promise.reject(new Error("Select a deck first"));
    }
    const topicHints = topicHintsFromLines(alsoCover);
    const pdfOpts = {
      figureExtractMode,
      source_role: sourceRole,
      ...(topicHints ? { topicHints } : {}),
      onScan: () => setReadingScan(true),
    };
    return figuresForThisPart.length > 0
      ? uploadPdfWithFigureCrops(
          selectedDeckId,
          part,
          figuresForThisPart,
          undefined,
          pdfOpts,
        )
      : uploadMaterialFile(selectedDeckId, part, undefined, pdfOpts);
  }

  async function onPdfSplitConfirm() {
    if (busy) return;
    if (!selectedDeckId || !uploadFile) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    setPdfSplitProgress("Splitting PDF…");
    try {
      const result = await runConsentedPdfSplitUpload({
        file: uploadFile,
        maxBytes: MAX_FILE_BYTES,
        figureFiles,
        onProgress: setPdfSplitProgress,
        uploadPart: uploadPdfPart,
      });
      if (!result.ok) {
        setPdfSplitOpen(false);
        setPdfSplitProgress(null);
        if (result.next === "compress") {
          setError(null);
          setPdfCompressProgress(null);
          setPdfCompressOpen(true);
          return;
        }
        setError(result.message);
        return;
      }

      const { parts, lastJobId, lastStatus, skippedFigures, materials } =
        result;
      clearUploadForm();
      setPdfSplitOpen(false);
      setPdfSplitProgress(null);
      const figureNote = skippedFigures ? ` ${FIGURES_SKIPPED_NOTICE}.` : "";
      const reused = batchAllReused(materials);
      if (lastJobId) {
        setJobId(lastJobId);
        setJobReused(reused);
        setNotice(
          storedUploadNotice({
            status: lastStatus,
            jobId: lastJobId,
            reused,
            parts: parts.length,
            figureNote,
          }),
        );
        setActiveStep(2);
      } else {
        setJobReused(false);
        setNotice(
          storedUploadNotice({
            status: lastStatus,
            jobId: null,
            parts: parts.length,
            figureNote,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload file");
      setPdfSplitOpen(false);
      setPdfSplitProgress(null);
    } finally {
      setBusy(false);
      setReadingScan(false);
    }
  }

  async function onPptxSplitConfirm() {
    if (busy) return;
    if (!selectedDeckId || !uploadFile) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    setPptxSplitProgress("Splitting PPTX…");
    try {
      const topicHints = topicHintsFromLines(alsoCover);
      const result = await runConsentedPptxSplitUpload({
        file: uploadFile,
        maxBytes: MAX_FILE_BYTES,
        onProgress: setPptxSplitProgress,
        uploadPart: (part) =>
          uploadMaterialFile(selectedDeckId, part, undefined, {
            ...(topicHints ? { topicHints } : {}),
            onScan: () => setReadingScan(true),
          }),
      });
      if (!result.ok) {
        setPptxSplitOpen(false);
        setPptxSplitProgress(null);
        setError(result.message);
        return;
      }

      const { parts, lastJobId, lastStatus, materials } = result;
      clearUploadForm();
      setPptxSplitOpen(false);
      setPptxSplitProgress(null);
      const reused = batchAllReused(materials);
      if (lastJobId) {
        setJobId(lastJobId);
        setJobReused(reused);
        setNotice(
          storedUploadNotice({
            status: lastStatus,
            jobId: lastJobId,
            reused,
            parts: parts.length,
          }),
        );
        setActiveStep(2);
      } else {
        setJobReused(false);
        setNotice(
          storedUploadNotice({
            status: lastStatus,
            jobId: null,
            parts: parts.length,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload file");
      setPptxSplitOpen(false);
      setPptxSplitProgress(null);
    } finally {
      setBusy(false);
      setReadingScan(false);
    }
  }

  function onPdfCompressCancel() {
    if (busy) return;
    setPdfCompressOpen(false);
    setPdfCompressProgress(null);
  }

  async function onPdfCompressConfirm() {
    if (busy) return;
    if (!selectedDeckId || !uploadFile) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    setPdfCompressProgress("Compressing…");
    try {
      const result = await runConsentedPdfCompressUpload({
        file: uploadFile,
        maxBytes: MAX_FILE_BYTES,
        figureFiles,
        onProgress: setPdfCompressProgress,
        uploadPart: uploadPdfPart,
      });
      if (!result.ok) {
        setError(result.message);
        setPdfCompressOpen(false);
        setPdfCompressProgress(null);
        return;
      }
      clearUploadForm();
      setPdfCompressOpen(false);
      setPdfCompressProgress(null);
      if (result.lastJobId) {
        setJobId(result.lastJobId);
        setJobReused(result.material.reused === true);
        setNotice(
          storedUploadNotice({
            status: result.lastStatus,
            jobId: result.lastJobId,
            reused: result.material.reused,
          }),
        );
        setActiveStep(2);
      } else {
        setJobReused(false);
        setNotice(
          storedUploadNotice({
            status: result.lastStatus,
            jobId: null,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload file");
      setPdfCompressOpen(false);
      setPdfCompressProgress(null);
    } finally {
      setBusy(false);
      setReadingScan(false);
    }
  }

  async function onUploadFile(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setJobId(null);
    setJobReused(false);
    if (!selectedDeckId) {
      setError("Select a deck first");
      return;
    }
    if (!uploadFile) {
      setError("Choose a PDF, PPTX, or image file");
      return;
    }
    const contentType = resolveUploadContentType(uploadFile);
    if (!ALLOWED_UPLOAD_MIMES.has(contentType)) {
      setError("Only PDF, PPTX, or image (jpeg/png/webp) files are allowed");
      return;
    }
    if (IMAGE_MIMES.has(contentType) && uploadFile.size > MAX_IMAGE_BYTES) {
      setError("Images for generation must be 8MB or smaller");
      return;
    }
    if (figureFiles.length > MAX_CLIENT_FIGURES) {
      setError(`Attach at most ${MAX_CLIENT_FIGURES} figure crops`);
      return;
    }
    for (const figure of figureFiles) {
      if (resolveUploadContentType(figure) !== "image/png") {
        setError("Figure crops must be PNG images");
        return;
      }
      if (figure.size > MAX_IMAGE_BYTES) {
        setError("Figure crops must be 8MB or smaller");
        return;
      }
    }
    if (
      contentType === "application/pdf" &&
      uploadFile.size > MAX_FILE_BYTES
    ) {
      if (uploadFile.size > MAX_SPLIT_SOURCE_BYTES) {
        setError(splitSourceTooLargeMessage(undefined, "pdf"));
        return;
      }
      setPdfSplitProgress(null);
      setPdfSplitOpen(true);
      return;
    }
    if (contentType === PPTX_MIME && uploadFile.size > MAX_FILE_BYTES) {
      if (uploadFile.size > MAX_SPLIT_SOURCE_BYTES) {
        setError(splitSourceTooLargeMessage(undefined, "pptx"));
        return;
      }
      setPptxSplitProgress(null);
      setPptxSplitOpen(true);
      return;
    }
    if (uploadFile.size > MAX_FILE_BYTES) {
      setError(fileTooLargeMessage());
      return;
    }
    setBusy(true);
    try {
      const topicHints = topicHintsFromLines(alsoCover);
      const pdfOpts =
        contentType === "application/pdf"
          ? {
              figureExtractMode,
              source_role: sourceRole,
              ...(topicHints ? { topicHints } : {}),
            }
          : {
              source_role: sourceRole,
              ...(topicHints ? { topicHints } : {}),
            };
      const material =
        contentType === "application/pdf" && figureFiles.length > 0
          ? await uploadPdfWithFigureCrops(
              selectedDeckId,
              uploadFile,
              figureFiles,
              undefined,
              { ...pdfOpts, onScan: () => setReadingScan(true) },
            )
          : await uploadMaterialFile(selectedDeckId, uploadFile, undefined, {
              ...pdfOpts,
              onScan: () => setReadingScan(true),
            });
      const hadLearningObjectives = Boolean(topicHintsFromLines(alsoCover));
      setUploadFile(null);
      setFigureFiles([]);
      setSourceRole("lecture");
      setAlsoCover("");
      if (material.jobId) {
        setJobId(material.jobId);
        setJobReused(material.reused === true);
        setNotice(
          storedUploadNotice({
            status: material.status,
            jobId: material.jobId,
            reused: material.reused,
          }),
        );
        setActiveStep(2);
      } else {
        setJobReused(false);
        setNotice(
          freePathNoJobNotice({
            hadLearningObjectives,
            manualOcclusion: material.manual_occlusion,
            status: material.status,
          }),
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload file");
    } finally {
      setBusy(false);
      setReadingScan(false);
    }
  }

  return {
    uploadFile,
    setUploadFile,
    figureFiles,
    setFigureFiles,
    figureExtractMode,
    setFigureExtractMode,
    pdfSplitOpen,
    pdfSplitProgress,
    pptxSplitOpen,
    pptxSplitProgress,
    pdfCompressOpen,
    pdfCompressProgress,
    llmConfigured,
    offerLearningObjectives,
    submitLabel,
    submitDisabled,
    freePathImageHelper,
    onPdfSplitCancel,
    onPptxSplitCancel,
    onPdfCompressCancel,
    onPdfSplitConfirm,
    onPptxSplitConfirm,
    onPdfCompressConfirm,
    onUploadFile,
  };
}

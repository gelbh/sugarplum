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
import { MAX_CLIENT_FIGURES } from "../lib/figureGeometry";
import {
  FREE_PATH_IMAGE_HELPER,
  diyOcclusionNotice,
  isImageUploadContentType,
  shouldOfferLearningObjectives,
  uploadSubmitLabel,
} from "../lib/learningObjectivesOffer";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_SPLIT_SOURCE_BYTES,
  fileTooLargeMessage,
  splitSourceTooLargeMessage,
} from "../lib/materialUploadLimits";
import { runConsentedPdfCompressUpload } from "../lib/runConsentedPdfCompressUpload";
import { runConsentedPdfSplitUpload } from "../lib/runConsentedPdfSplitUpload";
import { runConsentedPptxSplitUpload } from "../lib/runConsentedPptxSplitUpload";
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
        if (!cancelled) setLlmConfigured(false);
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
  const freePathImageHelper =
    offerLearningObjectives || !isImage ? null : FREE_PATH_IMAGE_HELPER;

  function freePathNoJobNotice(args: {
    hadLearningObjectives: boolean;
    wasFreePathImage: boolean;
    manualOcclusion?: boolean;
    status: string;
  }): string {
    if (args.manualOcclusion || args.wasFreePathImage) {
      return (
        diyOcclusionNotice({
          hadLearningObjectives: args.hadLearningObjectives,
        }).trim() || FREE_PATH_IMAGE_HELPER
      );
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

      const { parts, lastJobId, lastStatus, skippedFigures } = result;
      clearUploadForm();
      setPdfSplitOpen(false);
      setPdfSplitProgress(null);
      const figureNote = skippedFigures ? ` ${FIGURES_SKIPPED_NOTICE}.` : "";
      if (lastJobId) {
        setJobId(lastJobId);
        setNotice(
          parts.length > 1
            ? `Stored ${parts.length} materials (${lastStatus}). Generation started.${figureNote}`
            : `Stored file (${lastStatus}). Generation started.`,
        );
        setActiveStep(2);
      } else {
        setNotice(
          parts.length > 1
            ? `Stored ${parts.length} materials (${lastStatus}).${figureNote}`
            : `Stored file (${lastStatus}). Open drafts from a prior generate, or upload a new file.`,
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

      const { parts, lastJobId, lastStatus } = result;
      clearUploadForm();
      setPptxSplitOpen(false);
      setPptxSplitProgress(null);
      if (lastJobId) {
        setJobId(lastJobId);
        setNotice(
          parts.length > 1
            ? `Stored ${parts.length} materials (${lastStatus}). Generation started.`
            : `Stored file (${lastStatus}). Generation started.`,
        );
        setActiveStep(2);
      } else {
        setNotice(
          parts.length > 1
            ? `Stored ${parts.length} materials (${lastStatus}).`
            : `Stored file (${lastStatus}). Open drafts from a prior generate, or upload a new file.`,
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
        setNotice(`Stored file (${result.lastStatus}). Generation started.`);
        setActiveStep(2);
      } else {
        setNotice(
          `Stored file (${result.lastStatus}). Open drafts from a prior generate, or upload a new file.`,
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
      const wasFreePathImage =
        isImageUploadContentType(contentType) && llmConfigured !== true;
      const hadLearningObjectives = Boolean(topicHintsFromLines(alsoCover));
      setUploadFile(null);
      setFigureFiles([]);
      setSourceRole("lecture");
      setAlsoCover("");
      if (material.jobId) {
        setJobId(material.jobId);
        setNotice(`Stored file (${material.status}). Generation started.`);
        setActiveStep(2);
      } else {
        setNotice(
          freePathNoJobNotice({
            hadLearningObjectives,
            wasFreePathImage,
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

import { useState, type FormEvent } from "react";
import {
  ApiError,
  PPTX_MIME,
  resolveUploadContentType,
  uploadMaterialFile,
  uploadPdfWithFigureCrops,
} from "../../api/client";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  MAX_SPLIT_SOURCE_BYTES,
  batchAllReused,
  fileTooLargeMessage,
  splitSourceTooLargeMessage,
  storedUploadNotice,
} from "../../materials/kernel";
import { MAX_CLIENT_FIGURES } from "../../materials/clientKernel";
import type { AddMaterialConsentedUploads } from "./addMaterialWorkshopDeps";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_UPLOAD_MIMES = new Set([
  "application/pdf",
  PPTX_MIME,
  ...IMAGE_MIMES,
]);
const FIGURES_SKIPPED_NOTICE = "Figure crops skipped for split uploads";
/** Hub PDF uploads use Accurate so local/prod Docling can recover empty text PDFs. */
const PDF_ACCURATE_OPTS = {
  figureExtractMode: "accurate" as const,
};

type Args = {
  deckId: string;
  materialBusy: boolean;
  setMaterialBusy: (busy: boolean) => void;
  setReadingScan: (scanning: boolean) => void;
  setMaterialError: (error: string | null) => void;
  setMaterialNotice: (notice: string | null) => void;
  setAlsoCover: (value: string) => void;
  topicHintOpts: () => { topicHints?: string[] };
  snapshotHadLearningObjectives: () => boolean;
  prepareOcclusionFromImageKey?: (imageKey: string) => void;
  openDiyOcclusion: (
    imageKey: string,
    hadLearningObjectives: boolean,
  ) => void;
  consentedUploads: AddMaterialConsentedUploads;
  refreshDraftJobs: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
};

export function useAddMaterialFileUpload({
  deckId,
  materialBusy,
  setMaterialBusy,
  setReadingScan,
  setMaterialError,
  setMaterialNotice,
  setAlsoCover,
  topicHintOpts,
  snapshotHadLearningObjectives,
  prepareOcclusionFromImageKey,
  openDiyOcclusion,
  consentedUploads,
  refreshDraftJobs,
  refreshMaterials,
}: Args) {
  const {
    runConsentedPdfCompressUpload,
    runConsentedPdfSplitUpload,
    runConsentedPptxSplitUpload,
  } = consentedUploads;

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [figureFiles, setFigureFiles] = useState<File[]>([]);
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

  function onPdfSplitCancel() {
    if (materialBusy) return;
    setPdfSplitOpen(false);
    setPdfSplitProgress(null);
  }

  function onPptxSplitCancel() {
    if (materialBusy) return;
    setPptxSplitOpen(false);
    setPptxSplitProgress(null);
  }

  async function onPdfSplitConfirm() {
    if (materialBusy) return;
    if (!uploadFile) return;
    setMaterialError(null);
    setMaterialNotice(null);
    setMaterialBusy(true);
    setPdfSplitProgress("Splitting PDF…");
    try {
      const result = await runConsentedPdfSplitUpload({
        file: uploadFile,
        maxBytes: MAX_FILE_BYTES,
        figureFiles,
        onProgress: setPdfSplitProgress,
        uploadPart: (part, figuresForThisPart) =>
          figuresForThisPart.length > 0
            ? uploadPdfWithFigureCrops(
                deckId,
                part,
                figuresForThisPart,
                undefined,
                {
                  ...PDF_ACCURATE_OPTS,
                  ...topicHintOpts(),
                  onScan: () => setReadingScan(true),
                },
              )
            : uploadMaterialFile(deckId, part, undefined, {
                ...PDF_ACCURATE_OPTS,
                ...topicHintOpts(),
                onScan: () => setReadingScan(true),
              }),
      });
      if (!result.ok) {
        setPdfSplitOpen(false);
        setPdfSplitProgress(null);
        if (result.next === "compress") {
          setMaterialError(null);
          setPdfCompressProgress(null);
          setPdfCompressOpen(true);
          return;
        }
        setMaterialError(result.message);
        await Promise.all([refreshDraftJobs(), refreshMaterials()]);
        return;
      }

      const { parts, lastJobId, lastStatus, skippedFigures, materials } =
        result;
      let lastManualKey: string | null = null;
      for (const material of materials) {
        if (
          material.manual_occlusion &&
          material.r2_key &&
          prepareOcclusionFromImageKey
        ) {
          lastManualKey = material.r2_key;
        }
      }

      const hadLearningObjectives = snapshotHadLearningObjectives();
      setUploadFile(null);
      setFigureFiles([]);
      setAlsoCover("");
      setPdfSplitOpen(false);
      setPdfSplitProgress(null);
      const figureNote = skippedFigures ? ` ${FIGURES_SKIPPED_NOTICE}.` : "";
      const reused = batchAllReused(materials);
      if (lastJobId) {
        setMaterialNotice(
          storedUploadNotice({
            status: lastStatus,
            jobId: lastJobId,
            reused,
            parts: parts.length,
            figureNote,
          }),
        );
        window.location.assign(`/jobs/${encodeURIComponent(lastJobId)}/drafts`);
        return;
      }
      if (lastManualKey && prepareOcclusionFromImageKey) {
        openDiyOcclusion(lastManualKey, hadLearningObjectives);
        await Promise.all([refreshDraftJobs(), refreshMaterials()]);
        return;
      }
      setMaterialNotice(
        storedUploadNotice({
          status: lastStatus,
          jobId: null,
          parts: parts.length,
          figureNote,
        }),
      );
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not upload file",
      );
      setPdfSplitOpen(false);
      setPdfSplitProgress(null);
    } finally {
      setMaterialBusy(false);
      setReadingScan(false);
    }
  }

  async function onPptxSplitConfirm() {
    if (materialBusy) return;
    if (!uploadFile) return;
    setMaterialError(null);
    setMaterialNotice(null);
    setMaterialBusy(true);
    setPptxSplitProgress("Splitting PPTX…");
    try {
      const result = await runConsentedPptxSplitUpload({
        file: uploadFile,
        maxBytes: MAX_FILE_BYTES,
        onProgress: setPptxSplitProgress,
        uploadPart: (part) =>
          uploadMaterialFile(deckId, part, undefined, {
            ...topicHintOpts(),
            onScan: () => setReadingScan(true),
          }),
      });
      if (!result.ok) {
        setPptxSplitOpen(false);
        setPptxSplitProgress(null);
        setMaterialError(result.message);
        await Promise.all([refreshDraftJobs(), refreshMaterials()]);
        return;
      }

      const { parts, lastJobId, lastStatus, materials } = result;
      let lastManualKey: string | null = null;
      for (const material of materials) {
        if (
          material.manual_occlusion &&
          material.r2_key &&
          prepareOcclusionFromImageKey
        ) {
          lastManualKey = material.r2_key;
        }
      }

      const hadLearningObjectives = snapshotHadLearningObjectives();
      setUploadFile(null);
      setFigureFiles([]);
      setAlsoCover("");
      setPptxSplitOpen(false);
      setPptxSplitProgress(null);
      const reused = batchAllReused(materials);
      if (lastJobId) {
        setMaterialNotice(
          storedUploadNotice({
            status: lastStatus,
            jobId: lastJobId,
            reused,
            parts: parts.length,
          }),
        );
        window.location.assign(`/jobs/${encodeURIComponent(lastJobId)}/drafts`);
        return;
      }
      if (lastManualKey && prepareOcclusionFromImageKey) {
        openDiyOcclusion(lastManualKey, hadLearningObjectives);
        await Promise.all([refreshDraftJobs(), refreshMaterials()]);
        return;
      }
      setMaterialNotice(
        storedUploadNotice({
          status: lastStatus,
          jobId: null,
          parts: parts.length,
        }),
      );
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not upload file",
      );
      setPptxSplitOpen(false);
      setPptxSplitProgress(null);
    } finally {
      setMaterialBusy(false);
      setReadingScan(false);
    }
  }

  function onPdfCompressCancel() {
    if (materialBusy) return;
    setPdfCompressOpen(false);
    setPdfCompressProgress(null);
  }

  async function onPdfCompressConfirm() {
    if (materialBusy) return;
    if (!uploadFile) return;
    setMaterialError(null);
    setMaterialNotice(null);
    setMaterialBusy(true);
    setPdfCompressProgress("Compressing…");
    try {
      const result = await runConsentedPdfCompressUpload({
        file: uploadFile,
        maxBytes: MAX_FILE_BYTES,
        figureFiles,
        onProgress: setPdfCompressProgress,
        uploadPart: (part, figuresForThisPart) =>
          figuresForThisPart.length > 0
            ? uploadPdfWithFigureCrops(
                deckId,
                part,
                figuresForThisPart,
                undefined,
                {
                  ...PDF_ACCURATE_OPTS,
                  ...topicHintOpts(),
                  onScan: () => setReadingScan(true),
                },
              )
            : uploadMaterialFile(deckId, part, undefined, {
                ...PDF_ACCURATE_OPTS,
                ...topicHintOpts(),
                onScan: () => setReadingScan(true),
              }),
      });
      if (!result.ok) {
        setMaterialError(result.message);
        setPdfCompressOpen(false);
        setPdfCompressProgress(null);
        return;
      }

      const hadLearningObjectives = snapshotHadLearningObjectives();
      setUploadFile(null);
      setFigureFiles([]);
      setAlsoCover("");
      setPdfCompressOpen(false);
      setPdfCompressProgress(null);

      const { material } = result;
      if (
        material.manual_occlusion &&
        material.r2_key &&
        prepareOcclusionFromImageKey
      ) {
        openDiyOcclusion(material.r2_key, hadLearningObjectives);
        await Promise.all([refreshDraftJobs(), refreshMaterials()]);
        return;
      }
      if (result.lastJobId) {
        setMaterialNotice(
          storedUploadNotice({
            status: result.lastStatus,
            jobId: result.lastJobId,
            reused: result.material.reused,
          }),
        );
        window.location.assign(
          `/jobs/${encodeURIComponent(result.lastJobId)}/drafts`,
        );
        return;
      }
      setMaterialNotice(
        storedUploadNotice({
          status: result.lastStatus,
          jobId: null,
        }),
      );
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not upload file",
      );
      setPdfCompressOpen(false);
      setPdfCompressProgress(null);
    } finally {
      setMaterialBusy(false);
      setReadingScan(false);
    }
  }

  async function onUploadFile(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    if (!uploadFile) {
      setMaterialError("Choose a PDF, PPTX, or image file");
      return;
    }
    const contentType = resolveUploadContentType(uploadFile);
    if (!ALLOWED_UPLOAD_MIMES.has(contentType)) {
      setMaterialError(
        "Only PDF, PPTX, or image (jpeg/png/webp) files are allowed",
      );
      return;
    }
    if (IMAGE_MIMES.has(contentType) && uploadFile.size > MAX_IMAGE_BYTES) {
      setMaterialError("Images for generation must be 8MB or smaller");
      return;
    }
    if (figureFiles.length > MAX_CLIENT_FIGURES) {
      setMaterialError(`Attach at most ${MAX_CLIENT_FIGURES} figure crops`);
      return;
    }
    for (const figure of figureFiles) {
      if (resolveUploadContentType(figure) !== "image/png") {
        setMaterialError("Figure crops must be PNG images");
        return;
      }
      if (figure.size > MAX_IMAGE_BYTES) {
        setMaterialError("Figure crops must be 8MB or smaller");
        return;
      }
    }
    if (contentType === "application/pdf" && uploadFile.size > MAX_FILE_BYTES) {
      if (uploadFile.size > MAX_SPLIT_SOURCE_BYTES) {
        setMaterialError(splitSourceTooLargeMessage(undefined, "pdf"));
        return;
      }
      setPdfSplitProgress(null);
      setPdfSplitOpen(true);
      return;
    }
    if (contentType === PPTX_MIME && uploadFile.size > MAX_FILE_BYTES) {
      if (uploadFile.size > MAX_SPLIT_SOURCE_BYTES) {
        setMaterialError(splitSourceTooLargeMessage(undefined, "pptx"));
        return;
      }
      setPptxSplitProgress(null);
      setPptxSplitOpen(true);
      return;
    }
    if (uploadFile.size > MAX_FILE_BYTES) {
      setMaterialError(fileTooLargeMessage());
      return;
    }
    setMaterialBusy(true);
    try {
      const pdfOpts =
        contentType === "application/pdf"
          ? {
              ...PDF_ACCURATE_OPTS,
              ...topicHintOpts(),
              onScan: () => setReadingScan(true),
            }
          : {
              ...topicHintOpts(),
              onScan: () => setReadingScan(true),
            };
      const material =
        contentType === "application/pdf" && figureFiles.length > 0
          ? await uploadPdfWithFigureCrops(
              deckId,
              uploadFile,
              figureFiles,
              undefined,
              pdfOpts,
            )
          : await uploadMaterialFile(deckId, uploadFile, undefined, pdfOpts);
      const hadLearningObjectives = snapshotHadLearningObjectives();
      setUploadFile(null);
      setFigureFiles([]);
      setAlsoCover("");
      if (material.jobId) {
        setMaterialNotice(
          storedUploadNotice({
            status: material.status,
            jobId: material.jobId,
            reused: material.reused,
          }),
        );
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      if (
        material.manual_occlusion &&
        material.r2_key &&
        prepareOcclusionFromImageKey
      ) {
        openDiyOcclusion(material.r2_key, hadLearningObjectives);
        await Promise.all([refreshDraftJobs(), refreshMaterials()]);
        return;
      }
      setMaterialNotice(
        storedUploadNotice({
          status: material.status,
          jobId: null,
        }),
      );
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not upload file",
      );
    } finally {
      setMaterialBusy(false);
      setReadingScan(false);
    }
  }

  return {
    uploadFile,
    setUploadFile,
    figureFiles,
    setFigureFiles,
    pdfSplitOpen,
    pdfSplitProgress,
    pptxSplitOpen,
    pptxSplitProgress,
    pdfCompressOpen,
    pdfCompressProgress,
    onUploadFile,
    onPdfSplitConfirm,
    onPdfSplitCancel,
    onPptxSplitConfirm,
    onPptxSplitCancel,
    onPdfCompressConfirm,
    onPdfCompressCancel,
  };
}

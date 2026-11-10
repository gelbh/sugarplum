import {
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import {
  ApiError,
  pasteMaterial,
  PPTX_MIME,
  resolveUploadContentType,
  topicGenerate,
  uploadMaterialFile,
  uploadPdfWithFigureCrops,
} from "../api/client";
import { guestPasteToCards } from "../guest/pasteToCards";
import { guestAddAcceptedCards } from "../guest/store";
import { MAX_CLIENT_FIGURES } from "../lib/figureGeometry";
import {
  MAX_FILE_BYTES,
  MAX_IMAGE_BYTES,
  fileTooLargeMessage,
} from "../lib/materialUploadLimits";
import { splitPdfUnderLimit } from "../lib/splitPdfUnderLimit";
import type { WorkshopFrame } from "./workshopStack";
import { openDiyOcclusionFromImageKey } from "./openDiyOcclusion";

const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_UPLOAD_MIMES = new Set([
  "application/pdf",
  PPTX_MIME,
  ...IMAGE_MIMES,
]);
const FIGURES_SKIPPED_NOTICE = "Figure crops skipped for split uploads";

export type MaterialTab = "upload" | "paste" | "topic" | "diy";

type Args = {
  deckId: string;
  refreshCards: () => Promise<void>;
  refreshDraftJobs: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
  setWorkshopStack: Dispatch<SetStateAction<WorkshopFrame[]>>;
  prepareOcclusionFromImageKey?: (imageKey: string) => void;
};

export function useAddMaterialWorkshop({
  deckId,
  refreshCards,
  refreshDraftJobs,
  refreshMaterials,
  setWorkshopStack,
  prepareOcclusionFromImageKey,
}: Args) {
  const [materialTab, setMaterialTab] = useState<MaterialTab>("upload");
  const [pasteText, setPasteText] = useState("");
  const [pasteFilename, setPasteFilename] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [figureFiles, setFigureFiles] = useState<File[]>([]);
  const [materialBusy, setMaterialBusy] = useState(false);
  const [readingScan, setReadingScan] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [materialNotice, setMaterialNotice] = useState<string | null>(null);
  const [topicValue, setTopicValue] = useState("");
  const [topicBusy, setTopicBusy] = useState(false);
  const [topicError, setTopicError] = useState<string | null>(null);
  const [pdfSplitOpen, setPdfSplitOpen] = useState(false);
  const [pdfSplitProgress, setPdfSplitProgress] = useState<string | null>(
    null,
  );

  function resetMaterialMessages() {
    setMaterialError(null);
    setMaterialNotice(null);
    setTopicError(null);
  }

  function onTabChange(tab: MaterialTab) {
    setMaterialTab(tab);
    setWorkshopStack((prev) => {
      const top = prev[prev.length - 1];
      if (!top || top.id !== "addMaterial") return prev;
      return [...prev.slice(0, -1), { ...top, tab }];
    });
  }

  function openDiyOcclusion(imageKey: string) {
    if (!prepareOcclusionFromImageKey) return;
    openDiyOcclusionFromImageKey({
      imageKey,
      prepare: prepareOcclusionFromImageKey,
      goDiy: () => onTabChange("diy"),
      setNotice: setMaterialNotice,
    });
  }

  async function onGuestPaste(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    const { cards: pairs, truncated } = guestPasteToCards(pasteText);
    if (pairs.length === 0) {
      setMaterialError(
        "Paste needs clearer paragraphs or Q&A lines (blank line between cards).",
      );
      return;
    }
    setMaterialBusy(true);
    try {
      const added = guestAddAcceptedCards(deckId, pairs);
      if (added.length === 0) {
        setMaterialError("Could not save. Try again.");
        return;
      }
      setPasteText("");
      await refreshCards();
      const truncNote = truncated
        ? ` (kept first ${added.length}; paste was longer than the 40-card limit)`
        : "";
      setMaterialNotice(`Added ${added.length} local cards${truncNote}`);
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.code === 22)
      ) {
        setMaterialError(
          "Browser storage is full. Shorten the paste or clear guest data, then try again.",
        );
      } else {
        setMaterialError("Could not save local cards");
      }
    } finally {
      setMaterialBusy(false);
    }
  }

  async function onAccountPaste(e?: FormEvent) {
    e?.preventDefault();
    setMaterialError(null);
    setMaterialNotice(null);
    if (!pasteText.trim()) {
      setMaterialError("Paste some text first");
      return;
    }
    setMaterialBusy(true);
    try {
      const material = await pasteMaterial(deckId, {
        text: pasteText,
        ...(pasteFilename.trim() ? { filename: pasteFilename.trim() } : {}),
      });
      setPasteText("");
      setPasteFilename("");
      if (material.jobId) {
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setMaterialNotice(`Saved paste material (${material.status})`);
      await Promise.all([refreshDraftJobs(), refreshMaterials()]);
    } catch (err) {
      setMaterialError(
        err instanceof ApiError ? err.message : "Could not save paste",
      );
    } finally {
      setMaterialBusy(false);
    }
  }

  function onPdfSplitCancel() {
    if (materialBusy) return;
    setPdfSplitOpen(false);
    setPdfSplitProgress(null);
  }

  async function onPdfSplitConfirm() {
    if (!uploadFile) return;
    setMaterialError(null);
    setMaterialNotice(null);
    setMaterialBusy(true);
    setPdfSplitProgress("Splitting PDF…");
    try {
      const nameStem =
        uploadFile.name.replace(/\.pdf$/i, "") || "document";
      const split = await splitPdfUnderLimit(uploadFile, MAX_FILE_BYTES, {
        nameStem,
      });
      if (!split.ok) {
        setMaterialError(split.message);
        setPdfSplitOpen(false);
        setPdfSplitProgress(null);
        return;
      }

      const parts = split.files;
      const skipFigures = figureFiles.length > 0 && parts.length > 1;
      let lastJobId: string | null = null;
      let lastStatus = "";
      let lastManualKey: string | null = null;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        setPdfSplitProgress(`Uploading ${i + 1} of ${parts.length}`);
        try {
          const material =
            parts.length === 1 && figureFiles.length > 0
              ? await uploadPdfWithFigureCrops(
                  deckId,
                  part,
                  figureFiles,
                  undefined,
                  { onScan: () => setReadingScan(true) },
                )
              : await uploadMaterialFile(deckId, part, undefined, {
                  onScan: () => setReadingScan(true),
                });
          lastStatus = material.status;
          if (material.jobId) lastJobId = material.jobId;
          if (
            material.manual_occlusion &&
            material.r2_key &&
            prepareOcclusionFromImageKey
          ) {
            lastManualKey = material.r2_key;
          }
        } catch (err) {
          const detail =
            err instanceof ApiError ? err.message : "Could not upload file";
          setMaterialError(
            `Failed on part ${i + 1} of ${parts.length}: ${detail}`,
          );
          setPdfSplitOpen(false);
          setPdfSplitProgress(null);
          await Promise.all([refreshDraftJobs(), refreshMaterials()]);
          return;
        }
      }

      setUploadFile(null);
      setFigureFiles([]);
      setPdfSplitOpen(false);
      setPdfSplitProgress(null);
      const figureNote = skipFigures ? ` ${FIGURES_SKIPPED_NOTICE}.` : "";
      if (lastJobId) {
        setMaterialNotice(
          parts.length > 1
            ? `Stored ${parts.length} materials (${lastStatus}). Generation started.${figureNote}`
            : `Stored file (${lastStatus}). Generation started.`,
        );
        window.location.assign(
          `/jobs/${encodeURIComponent(lastJobId)}/drafts`,
        );
        return;
      }
      if (lastManualKey && prepareOcclusionFromImageKey) {
        openDiyOcclusion(lastManualKey);
        await Promise.all([refreshDraftJobs(), refreshMaterials()]);
        return;
      }
      setMaterialNotice(
        parts.length > 1
          ? `Stored ${parts.length} materials (${lastStatus}).${figureNote}`
          : `Stored file (${lastStatus}).`,
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
    if (
      contentType === "application/pdf" &&
      uploadFile.size > MAX_FILE_BYTES
    ) {
      setPdfSplitProgress(null);
      setPdfSplitOpen(true);
      return;
    }
    if (uploadFile.size > MAX_FILE_BYTES) {
      setMaterialError(fileTooLargeMessage());
      return;
    }
    setMaterialBusy(true);
    try {
      const material =
        contentType === "application/pdf" && figureFiles.length > 0
          ? await uploadPdfWithFigureCrops(
              deckId,
              uploadFile,
              figureFiles,
              undefined,
              { onScan: () => setReadingScan(true) },
            )
          : await uploadMaterialFile(deckId, uploadFile, undefined, {
              onScan: () => setReadingScan(true),
            });
      setUploadFile(null);
      setFigureFiles([]);
      if (material.jobId) {
        setMaterialNotice(
          `Stored file (${material.status}). Generation started.`,
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
        openDiyOcclusion(material.r2_key);
        await Promise.all([refreshDraftJobs(), refreshMaterials()]);
        return;
      }
      setMaterialNotice(`Stored file (${material.status}).`);
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

  async function onTopicGenerate(e?: FormEvent) {
    e?.preventDefault();
    const topic = topicValue.trim();
    if (!topic) {
      setTopicError("Enter a topic");
      return;
    }
    setTopicBusy(true);
    setTopicError(null);
    try {
      const { jobId } = await topicGenerate(deckId, { topic });
      setTopicValue("");
      window.location.assign(`/jobs/${encodeURIComponent(jobId)}/drafts`);
    } catch (err) {
      setTopicError(
        err instanceof ApiError ? err.message : "Could not start generation",
      );
    } finally {
      setTopicBusy(false);
    }
  }

  return {
    materialTab,
    setMaterialTab,
    pasteText,
    setPasteText,
    pasteFilename,
    setPasteFilename,
    uploadFile,
    setUploadFile,
    figureFiles,
    setFigureFiles,
    materialBusy,
    readingScan,
    materialError,
    materialNotice,
    topicValue,
    setTopicValue,
    topicBusy,
    topicError,
    pdfSplitOpen,
    pdfSplitProgress,
    resetMaterialMessages,
    onTabChange,
    openDiyOcclusion,
    onGuestPaste,
    onAccountPaste,
    onUploadFile,
    onPdfSplitConfirm,
    onPdfSplitCancel,
    onTopicGenerate,
  };
}

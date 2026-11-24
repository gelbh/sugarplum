import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  getLlmSettings,
  resolveUploadContentType,
  topicHintsFromLines,
} from "../../api/client";
import type { WorkshopFrame } from "../workshop/workshopStack";
import { openDiyOcclusionFromImageKey } from "../diy/openDiyOcclusion";
import type {
  AddMaterialLearningObjectives,
  AddMaterialConsentedUploads,
} from "./addMaterialWorkshopDeps";
import { useAddMaterialPaste } from "./useAddMaterialPaste";
import { useAddMaterialFileUpload } from "./useAddMaterialFileUpload";

export type MaterialTab = "upload" | "paste" | "diy";

type Args = {
  deckId: string;
  refreshCards: () => Promise<void>;
  refreshDraftJobs: () => Promise<void>;
  refreshMaterials: () => Promise<void>;
  setWorkshopStack: Dispatch<SetStateAction<WorkshopFrame[]>>;
  prepareOcclusionFromImageKey?: (imageKey: string) => void;
  /** Routes inject materials LO helpers (peer leaf; not materials/kernel). */
  learningObjectives: AddMaterialLearningObjectives;
  /** Routes inject consented upload runners from materials. */
  consentedUploads: AddMaterialConsentedUploads;
};

export function useAddMaterialWorkshop({
  deckId,
  refreshCards,
  refreshDraftJobs,
  refreshMaterials,
  setWorkshopStack,
  prepareOcclusionFromImageKey,
  learningObjectives,
  consentedUploads,
}: Args) {
  const {
    diyOcclusionNotice,
    freePathImageHelperText,
    isImageUploadContentType,
    shouldOfferLearningObjectives,
    uploadSubmitDisabled,
    uploadSubmitLabel,
  } = learningObjectives;

  const [materialTab, setMaterialTab] = useState<MaterialTab>("upload");
  const [alsoCover, setAlsoCover] = useState("");
  const [materialBusy, setMaterialBusy] = useState(false);
  const [readingScan, setReadingScan] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [materialNotice, setMaterialNotice] = useState<string | null>(null);
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getLlmSettings()
      .then((s) => {
        if (!cancelled) setLlmConfigured(s.configured);
      })
      .catch(() => {
        // Leave null: do not claim BYO is missing on fetch failure.
        if (!cancelled) setLlmConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetMaterialMessages() {
    setMaterialError(null);
    setMaterialNotice(null);
  }

  function topicHintOpts(): { topicHints?: string[] } {
    const topicHints = topicHintsFromLines(alsoCover);
    return topicHints ? { topicHints } : {};
  }

  function snapshotHadLearningObjectives(): boolean {
    return Boolean(topicHintsFromLines(alsoCover));
  }

  const {
    pasteText,
    setPasteText,
    pasteFilename,
    setPasteFilename,
    onGuestPaste,
    onAccountPaste,
  } = useAddMaterialPaste({
    deckId,
    setAlsoCover,
    setMaterialBusy,
    setMaterialError,
    setMaterialNotice,
    topicHintOpts,
    refreshCards,
    refreshDraftJobs,
    refreshMaterials,
  });

  function onTabChange(tab: MaterialTab | null) {
    resetMaterialMessages();
    if (tab) setMaterialTab(tab);
    setWorkshopStack((prev) => {
      const top = prev[prev.length - 1];
      if (!top || top.id !== "addMaterial") return prev;
      return [
        ...prev.slice(0, -1),
        tab ? { ...top, tab } : { id: "addMaterial" },
      ];
    });
  }

  function openDiyOcclusion(
    imageKey: string,
    hadLearningObjectives: boolean,
  ) {
    if (!prepareOcclusionFromImageKey) return;
    openDiyOcclusionFromImageKey({
      imageKey,
      prepare: prepareOcclusionFromImageKey,
      goDiy: () => onTabChange("diy"),
      setNotice: setMaterialNotice,
      notice: diyOcclusionNotice({ hadLearningObjectives }),
    });
  }

  const {
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
  } = useAddMaterialFileUpload({
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
  });

  const contentType = uploadFile
    ? resolveUploadContentType(uploadFile)
    : "";
  const isImage = Boolean(uploadFile) && isImageUploadContentType(contentType);
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
    busy: materialBusy,
  });

  useEffect(() => {
    if (isImage && !offerLearningObjectives && alsoCover) {
      setAlsoCover("");
    }
  }, [isImage, offerLearningObjectives, alsoCover]);

  return {
    materialTab,
    setMaterialTab,
    pasteText,
    setPasteText,
    pasteFilename,
    setPasteFilename,
    alsoCover,
    setAlsoCover,
    uploadFile,
    setUploadFile,
    figureFiles,
    setFigureFiles,
    materialBusy,
    readingScan,
    materialError,
    materialNotice,
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
    resetMaterialMessages,
    onTabChange,
    openDiyOcclusion,
    onGuestPaste,
    onAccountPaste,
    onUploadFile,
    onPdfSplitConfirm,
    onPdfSplitCancel,
    onPptxSplitConfirm,
    onPptxSplitCancel,
    onPdfCompressConfirm,
    onPdfCompressCancel,
  };
}

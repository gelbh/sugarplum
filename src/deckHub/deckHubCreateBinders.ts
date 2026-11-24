import type { CreateCardController } from "./useCreateCardController";
import type { useAddMaterialWorkshop } from "./useAddMaterialWorkshop";
import type {
  DeckHubCreateCardUi,
  DeckHubCreateMaterialUi,
} from "./DeckHubCreateView";

type MaterialHook = ReturnType<typeof useAddMaterialWorkshop>;

export function deckHubCreateMaterialUi(
  material: MaterialHook,
): DeckHubCreateMaterialUi {
  return {
    materialError: material.materialError,
    materialNotice: material.materialNotice,
    resetMaterialMessages: material.resetMaterialMessages,
    materialBusy: material.materialBusy,
    readingScan: material.readingScan,
    pasteText: material.pasteText,
    setPasteText: material.setPasteText,
    pasteFilename: material.pasteFilename,
    setPasteFilename: material.setPasteFilename,
    alsoCover: material.alsoCover,
    setAlsoCover: material.setAlsoCover,
    onGuestPaste: material.onGuestPaste,
    onAccountPaste: material.onAccountPaste,
    uploadFile: material.uploadFile,
    setUploadFile: material.setUploadFile,
    setFigureFiles: material.setFigureFiles,
    figureFiles: material.figureFiles,
    onUploadFile: material.onUploadFile,
    offerLearningObjectives: material.offerLearningObjectives,
    submitLabel: material.submitLabel,
    submitDisabled: material.submitDisabled,
    freePathImageHelper: material.freePathImageHelper,
    pdfSplitOpen: material.pdfSplitOpen,
    pdfSplitProgress: material.pdfSplitProgress,
    onPdfSplitConfirm: material.onPdfSplitConfirm,
    onPdfSplitCancel: material.onPdfSplitCancel,
    pptxSplitOpen: material.pptxSplitOpen,
    pptxSplitProgress: material.pptxSplitProgress,
    onPptxSplitConfirm: material.onPptxSplitConfirm,
    onPptxSplitCancel: material.onPptxSplitCancel,
    pdfCompressOpen: material.pdfCompressOpen,
    pdfCompressProgress: material.pdfCompressProgress,
    onPdfCompressConfirm: material.onPdfCompressConfirm,
    onPdfCompressCancel: material.onPdfCompressCancel,
  };
}

export function deckHubCreateCardUi(
  create: CreateCardController,
): DeckHubCreateCardUi {
  return {
    createCard: create.createCard,
    createBusy: create.createBusy,
    createImageBusy: create.createImageBusy,
    createError: create.createError,
    createNotice: create.createNotice,
    createSessionHasCard: create.createSessionHasCard,
    createNeedsImage: create.createNeedsImage,
    createImageKey: create.createImageKey,
    createImageInputRef: create.createImageInputRef,
    onCreateChange: create.onCreateChange,
    onCreateCard: create.onCreateCard,
    onCreateImageUpload: create.onCreateImageUpload,
    applyCreateImageKey: create.applyCreateImageKey,
    clearCreateNotice: create.clearCreateNotice,
    hubDiyAllowedTypes: create.hubDiyAllowedTypes,
  };
}

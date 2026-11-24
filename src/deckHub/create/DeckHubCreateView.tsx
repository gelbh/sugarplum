import type { FormEvent, RefObject } from "react";
import Box from "@mui/material/Box";
import {
  PdfCompressConsent,
  PdfSplitConsent,
  PptxSplitConsent,
  fileSizeCapMb,
} from "../../materials";
import type { CardDraftView, CardType } from "../../api/client";
import type { DraftEditorChange } from "../../draftReview/kernel";
import AddMaterialWorkshop, {
  type AddMaterialTab,
} from "./AddMaterialWorkshop";

export type DeckHubCreateMaterialUi = {
  materialError: string | null;
  materialNotice: string | null;
  resetMaterialMessages: () => void;
  materialBusy: boolean;
  readingScan: boolean;
  pasteText: string;
  setPasteText: (value: string) => void;
  pasteFilename: string;
  setPasteFilename: (value: string) => void;
  alsoCover: string;
  setAlsoCover: (value: string) => void;
  onGuestPaste: (e?: FormEvent) => void;
  onAccountPaste: (e?: FormEvent) => void;
  uploadFile: File | null;
  setUploadFile: (file: File | null) => void;
  setFigureFiles: (files: File[]) => void;
  figureFiles: File[];
  onUploadFile: (e?: FormEvent) => void;
  offerLearningObjectives: boolean;
  submitLabel: "Continue" | "Start generation";
  submitDisabled?: boolean;
  freePathImageHelper: string | null;
  pdfSplitOpen: boolean;
  pdfSplitProgress: string | null;
  onPdfSplitConfirm: () => void | Promise<void>;
  onPdfSplitCancel: () => void;
  pptxSplitOpen: boolean;
  pptxSplitProgress: string | null;
  onPptxSplitConfirm: () => void | Promise<void>;
  onPptxSplitCancel: () => void;
  pdfCompressOpen: boolean;
  pdfCompressProgress: string | null;
  onPdfCompressConfirm: () => void | Promise<void>;
  onPdfCompressCancel: () => void;
};

export type DeckHubCreateCardUi = {
  createCard: CardDraftView;
  createBusy: boolean;
  createImageBusy: boolean;
  createError: string | null;
  createNotice: string | null;
  createSessionHasCard: boolean;
  createNeedsImage: boolean;
  createImageKey: string;
  createImageInputRef: RefObject<HTMLInputElement | null>;
  onCreateChange: (next: DraftEditorChange) => void;
  onCreateCard: (e?: FormEvent) => void;
  onCreateImageUpload: (file: File) => void;
  applyCreateImageKey: (key: string) => void;
  clearCreateNotice: () => void;
  hubDiyAllowedTypes: CardType[];
};

export type DeckHubCreateViewProps = {
  guest: boolean;
  tab: AddMaterialTab | null;
  onTabChange: (tab: AddMaterialTab | null) => void;
  onCancel: () => void;
  materialUi: DeckHubCreateMaterialUi;
  createUi: DeckHubCreateCardUi;
  deckImageKeys: string[];
};

export default function DeckHubCreateView({
  guest,
  tab,
  onTabChange,
  onCancel,
  materialUi,
  createUi,
  deckImageKeys,
}: DeckHubCreateViewProps) {
  return (
    <Box
      key="create-flashcards"
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        animation: "deckHubCreateIn 320ms cubic-bezier(0.2, 0, 0, 1)",
        "@keyframes deckHubCreateIn": {
          from: { opacity: 0, transform: "translateX(40px)" },
          to: { opacity: 1, transform: "translateX(0)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          animation: "none",
        },
      }}
    >
      <AddMaterialWorkshop
        guest={guest}
        tab={tab}
        onTabChange={onTabChange}
        onCancel={onCancel}
        materialError={materialUi.materialError}
        materialNotice={materialUi.materialNotice}
        onClearMaterialMessages={materialUi.resetMaterialMessages}
        materialBusy={materialUi.materialBusy}
        readingScan={materialUi.readingScan}
        pasteText={materialUi.pasteText}
        onPasteTextChange={materialUi.setPasteText}
        pasteFilename={materialUi.pasteFilename}
        onPasteFilenameChange={materialUi.setPasteFilename}
        alsoCover={materialUi.alsoCover}
        onAlsoCoverChange={materialUi.setAlsoCover}
        onGuestPaste={materialUi.onGuestPaste}
        onAccountPaste={materialUi.onAccountPaste}
        uploadFile={materialUi.uploadFile}
        onUploadFileChange={materialUi.setUploadFile}
        onFigureFilesChange={materialUi.setFigureFiles}
        onUploadFile={materialUi.onUploadFile}
        offerLearningObjectives={materialUi.offerLearningObjectives}
        submitLabel={materialUi.submitLabel}
        submitDisabled={materialUi.submitDisabled}
        freePathImageHelper={materialUi.freePathImageHelper}
        renderUploadConsents={() => (
          <>
            <PdfSplitConsent
              open={materialUi.pdfSplitOpen}
              fileName={materialUi.uploadFile?.name ?? "PDF"}
              figuresWillSkip={materialUi.figureFiles.length > 0}
              progressLabel={materialUi.pdfSplitProgress}
              busy={materialUi.materialBusy}
              onConfirm={() => {
                void materialUi.onPdfSplitConfirm();
              }}
              onCancel={materialUi.onPdfSplitCancel}
            />
            <PptxSplitConsent
              open={materialUi.pptxSplitOpen}
              fileName={materialUi.uploadFile?.name ?? "PPTX"}
              maxMb={fileSizeCapMb()}
              progressLabel={materialUi.pptxSplitProgress}
              busy={materialUi.materialBusy}
              onConfirm={() => {
                void materialUi.onPptxSplitConfirm();
              }}
              onCancel={materialUi.onPptxSplitCancel}
            />
            <PdfCompressConsent
              open={materialUi.pdfCompressOpen}
              fileName={materialUi.uploadFile?.name ?? "PDF"}
              progressLabel={materialUi.pdfCompressProgress}
              busy={materialUi.materialBusy}
              onConfirm={() => {
                void materialUi.onPdfCompressConfirm();
              }}
              onCancel={materialUi.onPdfCompressCancel}
            />
          </>
        )}
        createCard={createUi.createCard}
        createBusy={createUi.createBusy}
        createImageBusy={createUi.createImageBusy}
        createError={createUi.createError}
        createNotice={createUi.createNotice}
        createSessionHasCard={createUi.createSessionHasCard}
        createNeedsImage={createUi.createNeedsImage}
        createImageKey={createUi.createImageKey}
        deckImageKeys={deckImageKeys}
        createImageInputRef={createUi.createImageInputRef}
        onCreateChange={createUi.onCreateChange}
        onCreateCard={createUi.onCreateCard}
        onCreateImageUpload={createUi.onCreateImageUpload}
        applyCreateImageKey={createUi.applyCreateImageKey}
        clearCreateNotice={createUi.clearCreateNotice}
        hubDiyAllowedTypes={createUi.hubDiyAllowedTypes}
      />
    </Box>
  );
}

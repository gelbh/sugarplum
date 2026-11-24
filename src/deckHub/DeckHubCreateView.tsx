import Box from "@mui/material/Box";
import {
  PdfCompressConsent,
  PdfSplitConsent,
  PptxSplitConsent,
  fileSizeCapMb,
} from "../materials";
import AddMaterialWorkshop, {
  type AddMaterialTab,
} from "./AddMaterialWorkshop";
import type { CreateCardController } from "./useCreateCardController";
import type { useAddMaterialWorkshop } from "./useAddMaterialWorkshop";

type MaterialBinder = ReturnType<typeof useAddMaterialWorkshop>;

export type DeckHubCreateViewProps = {
  guest: boolean;
  tab: AddMaterialTab | null;
  onTabChange: (tab: AddMaterialTab | null) => void;
  onCancel: () => void;
  material: MaterialBinder;
  create: CreateCardController;
  deckImageKeys: string[];
};

export default function DeckHubCreateView({
  guest,
  tab,
  onTabChange,
  onCancel,
  material,
  create,
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
        materialError={material.materialError}
        materialNotice={material.materialNotice}
        onClearMaterialMessages={material.resetMaterialMessages}
        materialBusy={material.materialBusy}
        readingScan={material.readingScan}
        pasteText={material.pasteText}
        onPasteTextChange={material.setPasteText}
        pasteFilename={material.pasteFilename}
        onPasteFilenameChange={material.setPasteFilename}
        alsoCover={material.alsoCover}
        onAlsoCoverChange={material.setAlsoCover}
        onGuestPaste={material.onGuestPaste}
        onAccountPaste={material.onAccountPaste}
        uploadFile={material.uploadFile}
        onUploadFileChange={material.setUploadFile}
        onFigureFilesChange={material.setFigureFiles}
        onUploadFile={material.onUploadFile}
        offerLearningObjectives={material.offerLearningObjectives}
        submitLabel={material.submitLabel}
        submitDisabled={material.submitDisabled}
        freePathImageHelper={material.freePathImageHelper}
        renderUploadConsents={() => (
          <>
            <PdfSplitConsent
              open={material.pdfSplitOpen}
              fileName={material.uploadFile?.name ?? "PDF"}
              figuresWillSkip={material.figureFiles.length > 0}
              progressLabel={material.pdfSplitProgress}
              busy={material.materialBusy}
              onConfirm={() => {
                void material.onPdfSplitConfirm();
              }}
              onCancel={material.onPdfSplitCancel}
            />
            <PptxSplitConsent
              open={material.pptxSplitOpen}
              fileName={material.uploadFile?.name ?? "PPTX"}
              maxMb={fileSizeCapMb()}
              progressLabel={material.pptxSplitProgress}
              busy={material.materialBusy}
              onConfirm={() => {
                void material.onPptxSplitConfirm();
              }}
              onCancel={material.onPptxSplitCancel}
            />
            <PdfCompressConsent
              open={material.pdfCompressOpen}
              fileName={material.uploadFile?.name ?? "PDF"}
              progressLabel={material.pdfCompressProgress}
              busy={material.materialBusy}
              onConfirm={() => {
                void material.onPdfCompressConfirm();
              }}
              onCancel={material.onPdfCompressCancel}
            />
          </>
        )}
        createCard={create.createCard}
        createBusy={create.createBusy}
        createImageBusy={create.createImageBusy}
        createError={create.createError}
        createNotice={create.createNotice}
        createSessionHasCard={create.createSessionHasCard}
        createNeedsImage={create.createNeedsImage}
        createImageKey={create.createImageKey}
        deckImageKeys={deckImageKeys}
        createImageInputRef={create.createImageInputRef}
        onCreateChange={create.onCreateChange}
        onCreateCard={create.onCreateCard}
        onCreateImageUpload={create.onCreateImageUpload}
        applyCreateImageKey={create.applyCreateImageKey}
        clearCreateNotice={create.clearCreateNotice}
        hubDiyAllowedTypes={create.hubDiyAllowedTypes}
      />
    </Box>
  );
}

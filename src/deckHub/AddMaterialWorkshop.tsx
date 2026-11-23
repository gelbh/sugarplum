import type { FormEvent, ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { CreateFlowNotice } from "../library/CreateFlowNotice";
import type { CardDraftView, CardType } from "../api/client";
import type { DraftEditorChange } from "../draftReview/kernel";
import AddMaterialDiyPanel from "./AddMaterialDiyPanel";
import AddMaterialMethodChooser, {
  METHOD_META,
  StepHeader,
  type AddMaterialTab,
} from "./AddMaterialMethodChooser";
import AddMaterialPastePanel from "./AddMaterialPastePanel";
import AddMaterialUploadPanel from "./AddMaterialUploadPanel";

export type { AddMaterialTab };

const panInSx = {
  flex: 1,
  width: "100%",
  minHeight: 0,
  display: "flex",
  flexDirection: "column" as const,
  animation: "flashcardsStepIn 320ms cubic-bezier(0.2, 0, 0, 1)",
  "@keyframes flashcardsStepIn": {
    from: { opacity: 0, transform: "translateX(40px)" },
    to: { opacity: 1, transform: "translateX(0)" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    animation: "none",
  },
};

type Props = {
  guest: boolean;
  tab: AddMaterialTab | null;
  onTabChange: (tab: AddMaterialTab | null) => void;
  onCancel: () => void;
  /**
   * When true (mission-board Create flashcards), method Back returns to the
   * upload/paste/diy chooser. When false (opened from Browse cards/files with
   * a stacked parent), method Back leaves the create flow to that parent.
   */
  returnToChooser?: boolean;
  materialError: string | null;
  materialNotice: string | null;
  onClearMaterialMessages: () => void;
  materialBusy: boolean;
  readingScan: boolean;
  pasteText: string;
  onPasteTextChange: (value: string) => void;
  pasteFilename: string;
  onPasteFilenameChange: (value: string) => void;
  alsoCover: string;
  onAlsoCoverChange: (value: string) => void;
  onGuestPaste: (e?: FormEvent) => void;
  onAccountPaste: (e?: FormEvent) => void;
  uploadFile: File | null;
  onUploadFileChange: (file: File | null) => void;
  onFigureFilesChange: (files: File[]) => void;
  onUploadFile: (e?: FormEvent) => void;
  offerLearningObjectives: boolean;
  submitLabel: "Continue" | "Start generation";
  submitDisabled?: boolean;
  freePathImageHelper: string | null;
  /** Routes compose materials consent dialogs (peer leaf). */
  renderUploadConsents: () => ReactNode;
  createCard: CardDraftView;
  createBusy: boolean;
  createImageBusy: boolean;
  createError: string | null;
  createNotice: string | null;
  createSessionHasCard: boolean;
  createNeedsImage: boolean;
  createImageKey: string;
  deckImageKeys: string[];
  createImageInputRef: React.RefObject<HTMLInputElement | null>;
  onCreateChange: (next: DraftEditorChange) => void;
  onCreateCard: (e?: FormEvent) => void;
  onCreateImageUpload: (file: File) => void;
  applyCreateImageKey: (key: string) => void;
  clearCreateNotice: () => void;
  hubDiyAllowedTypes: CardType[];
};

export default function AddMaterialWorkshop({
  guest,
  tab,
  onTabChange,
  onCancel,
  returnToChooser = true,
  materialError,
  materialNotice,
  onClearMaterialMessages,
  materialBusy,
  readingScan,
  pasteText,
  onPasteTextChange,
  pasteFilename,
  onPasteFilenameChange,
  alsoCover,
  onAlsoCoverChange,
  onGuestPaste,
  onAccountPaste,
  uploadFile,
  onUploadFileChange,
  onFigureFilesChange,
  onUploadFile,
  offerLearningObjectives,
  submitLabel,
  submitDisabled = false,
  freePathImageHelper,
  renderUploadConsents,
  createCard,
  createBusy,
  createImageBusy,
  createError,
  createNotice,
  createSessionHasCard,
  createNeedsImage,
  createImageKey,
  deckImageKeys,
  createImageInputRef,
  onCreateChange,
  onCreateCard,
  onCreateImageUpload,
  applyCreateImageKey,
  clearCreateNotice,
  hubDiyAllowedTypes,
}: Props) {
  const methods: AddMaterialTab[] = guest
    ? ["paste", "diy"]
    : ["upload", "paste", "diy"];
  const activeTab =
    tab && methods.includes(tab) ? tab : tab === null ? null : methods[0];

  function onMethodBack() {
    if (returnToChooser) onTabChange(null);
    else onCancel();
  }

  const showMaterialAlerts = activeTab === "upload" || activeTab === "paste";

  const alerts = (
    <>
      {showMaterialAlerts && materialError ? (
        <CreateFlowNotice tone="error" onClose={onClearMaterialMessages}>
          {materialError}
        </CreateFlowNotice>
      ) : null}
      {showMaterialAlerts && materialNotice ? (
        <CreateFlowNotice tone="success" onClose={onClearMaterialMessages}>
          {materialNotice}
        </CreateFlowNotice>
      ) : null}
      {guest ? (
        <CreateFlowNotice tone="info">
          Cards stay in this browser only. Sign in for uploads and AI
          generation.
        </CreateFlowNotice>
      ) : null}
    </>
  );

  const consents = renderUploadConsents();

  if (activeTab === null) {
    return (
      <Box key="chooser" sx={panInSx}>
        <AddMaterialMethodChooser
          guest={guest}
          methods={methods}
          onTabChange={onTabChange}
          onCancel={onCancel}
          alerts={alerts}
        />
        {consents}
      </Box>
    );
  }

  const meta = METHOD_META[activeTab];

  return (
    <Box key={activeTab} sx={panInSx}>
      <Box
        sx={{
          flex: 1,
          width: "100%",
          minHeight: 0,
          overflow: "auto",
          display: "flex",
          // Center short upload/paste forms. DIY can be taller than the viewport;
          // align start so the occlusion image stage is not clipped above the fold.
          alignItems: activeTab === "diy" ? "flex-start" : "center",
          justifyContent: "center",
          px: 2,
          py: { xs: 3, md: 4 },
        }}
      >
        <Stack
          spacing={2.5}
          sx={{
            width: "100%",
            maxWidth: activeTab === "diy" ? { xs: 520, md: 960 } : 520,
          }}
        >
          <StepHeader heading={meta.heading} blurb={meta.blurb} />
          {alerts}

          {activeTab === "upload" && !guest ? (
            <AddMaterialUploadPanel
              materialBusy={materialBusy}
              readingScan={readingScan}
              alsoCover={alsoCover}
              onAlsoCoverChange={onAlsoCoverChange}
              uploadFile={uploadFile}
              onUploadFileChange={onUploadFileChange}
              onFigureFilesChange={onFigureFilesChange}
              onUploadFile={onUploadFile}
              onBack={onMethodBack}
              offerLearningObjectives={offerLearningObjectives}
              submitLabel={submitLabel}
              submitDisabled={submitDisabled}
              freePathImageHelper={freePathImageHelper}
            />
          ) : null}

          {activeTab === "paste" ? (
            <AddMaterialPastePanel
              guest={guest}
              materialBusy={materialBusy}
              createBusy={createBusy}
              pasteText={pasteText}
              onPasteTextChange={onPasteTextChange}
              pasteFilename={pasteFilename}
              onPasteFilenameChange={onPasteFilenameChange}
              alsoCover={alsoCover}
              onAlsoCoverChange={onAlsoCoverChange}
              onGuestPaste={onGuestPaste}
              onAccountPaste={onAccountPaste}
              onBack={onMethodBack}
            />
          ) : null}

          {activeTab === "diy" ? (
            <AddMaterialDiyPanel
              createCard={createCard}
              createBusy={createBusy}
              createImageBusy={createImageBusy}
              createError={createError}
              createNotice={createNotice}
              createSessionHasCard={createSessionHasCard}
              createNeedsImage={createNeedsImage}
              createImageKey={createImageKey}
              deckImageKeys={deckImageKeys}
              createImageInputRef={createImageInputRef}
              onCreateChange={onCreateChange}
              onCreateCard={onCreateCard}
              onCreateImageUpload={onCreateImageUpload}
              applyCreateImageKey={applyCreateImageKey}
              clearCreateNotice={clearCreateNotice}
              hubDiyAllowedTypes={hubDiyAllowedTypes}
              onBack={onMethodBack}
              onFinish={onCancel}
            />
          ) : null}
        </Stack>
      </Box>
      {consents}
    </Box>
  );
}

import type { FormEvent, ReactNode } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { CreateFlowNotice } from "../../library/CreateFlowNotice";
import type { CardDraftView, CardType } from "../../api/client";
import type { DraftEditorChange } from "../../draftReview/kernel";
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
          // DIY fills the column (preview grows); other methods scroll as needed.
          overflow: activeTab === "diy" ? { xs: "hidden", md: "auto" } : "auto",
          display: "flex",
          alignItems:
            activeTab === "diy"
              ? { xs: "stretch", md: "flex-start" }
              : "center",
          justifyContent: activeTab === "diy" ? "flex-start" : "center",
          px: 2,
          pt: {
            xs: activeTab === "diy" ? 1.5 : 3,
            md: 4,
          },
          pb: {
            xs: activeTab === "diy" ? 1 : 3,
            md: 4,
          },
        }}
      >
        <Stack
          spacing={{
            xs: activeTab === "diy" ? 1.25 : 2.5,
            md: 2.5,
          }}
          sx={{
            width: "100%",
            minWidth: 0,
            maxWidth: activeTab === "diy" ? { xs: 520, md: 960 } : 520,
            boxSizing: "border-box",
            ...(activeTab === "diy"
              ? {
                  flex: 1,
                  minHeight: 0,
                  height: { xs: "100%", md: "auto" },
                }
              : {}),
          }}
        >
          <StepHeader
            heading={meta.heading}
            blurb={meta.blurb}
            compact={activeTab === "diy"}
          />
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
              pasteText={pasteText}
              onPasteTextChange={onPasteTextChange}
              pasteFilename={pasteFilename}
              onPasteFilenameChange={onPasteFilenameChange}
              alsoCover={alsoCover}
              onAlsoCoverChange={onAlsoCoverChange}
              onGuestPaste={onGuestPaste}
              onAccountPaste={onAccountPaste}
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
              onFinish={onCancel}
            />
          ) : null}
        </Stack>
      </Box>
      {consents}
    </Box>
  );
}

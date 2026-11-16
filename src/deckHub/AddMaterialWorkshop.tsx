import { useEffect, useState, type DragEvent, type FormEvent } from "react";
import type { SvgIconComponent } from "@mui/icons-material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import ContentPasteOutlinedIcon from "@mui/icons-material/ContentPasteOutlined";
import EditNoteOutlinedIcon from "@mui/icons-material/EditNoteOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import DraftCardEditor, {
  type DraftEditorChange,
  type DraftPreviewFace,
} from "../components/DraftCardEditor";
import PdfCompressConsent from "../components/PdfCompressConsent";
import PdfSplitConsent from "../components/PdfSplitConsent";
import PptxSplitConsent from "../components/PptxSplitConsent";
import {
  CreateFlowNotice,
  CreateFlowNoticeFade,
} from "../library/CreateFlowNotice";
import DiyCardPreview from "./DiyCardPreview";
import { MAX_IMAGE_BYTES, fileSizeCapMb } from "../lib/materialUploadLimits";
import {
  PPTX_MIME,
  resolveUploadContentType,
  type CardDraftView,
  type CardType,
} from "../api/client";

export type AddMaterialTab = "upload" | "paste" | "diy";

const UPLOAD_ACCEPT =
  "application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  PPTX_MIME,
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const METHOD_META: Record<
  AddMaterialTab,
  { label: string; heading: string; blurb: string; Icon: SvgIconComponent }
> = {
  upload: {
    label: "Upload",
    heading: "Upload notes",
    blurb: "Drop lecture slides or notes. We generate draft cards next.",
    Icon: UploadFileOutlinedIcon,
  },
  paste: {
    label: "Paste",
    heading: "Paste text",
    blurb: "Paste notes or excerpts. We turn them into draft cards.",
    Icon: ContentPasteOutlinedIcon,
  },
  diy: {
    label: "Write a card",
    heading: "Write a card",
    blurb: "Build one card by hand and add it to this deck.",
    Icon: EditNoteOutlinedIcon,
  },
};

function isAllowedUploadFile(file: File): boolean {
  return ALLOWED_UPLOAD_TYPES.has(resolveUploadContentType(file));
}

function uploadKindLabel(file: File): string {
  const type = resolveUploadContentType(file);
  if (type === "application/pdf") return "PDF";
  if (type === PPTX_MIME) return "PPTX";
  if (type.startsWith("image/")) return "Image";
  return "File";
}

function formatUploadBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FOOTER_BTN_SX = {
  color: "text.secondary",
  textTransform: "none",
  fontWeight: 500,
  px: 0.5,
  minWidth: 0,
  "&:hover": {
    bgcolor: "transparent",
    color: "text.primary",
  },
} as const;

const PRIMARY_PILL_SX = {
  minWidth: 140,
  px: 2.5,
  py: 1.1,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

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
  onGuestPaste: (e?: FormEvent) => void;
  onAccountPaste: (e?: FormEvent) => void;
  uploadFile: File | null;
  onUploadFileChange: (file: File | null) => void;
  figureFiles: File[];
  onFigureFilesChange: (files: File[]) => void;
  onUploadFile: (e?: FormEvent) => void;
  pdfSplitOpen: boolean;
  pdfSplitProgress: string | null;
  onPdfSplitConfirm: () => void;
  onPdfSplitCancel: () => void;
  pptxSplitOpen: boolean;
  pptxSplitProgress: string | null;
  onPptxSplitConfirm: () => void;
  onPptxSplitCancel: () => void;
  pdfCompressOpen: boolean;
  pdfCompressProgress: string | null;
  onPdfCompressConfirm: () => void;
  onPdfCompressCancel: () => void;
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

function StepHeader({ heading, blurb }: { heading: string; blurb: string }) {
  return (
    <Box>
      <Typography
        component="p"
        sx={{
          m: 0,
          mb: 0.75,
          fontSize: "0.6875rem",
          fontWeight: 500,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "primary.main",
        }}
      >
        Create flashcards
      </Typography>
      <Typography
        variant="h3"
        component="h2"
        sx={{
          m: 0,
          fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
          fontWeight: 400,
          letterSpacing: "0.02em",
          lineHeight: 1.15,
          color: "text.primary",
        }}
      >
        {heading}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 1, maxWidth: "40ch", lineHeight: 1.5 }}
      >
        {blurb}
      </Typography>
    </Box>
  );
}

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
  onGuestPaste,
  onAccountPaste,
  uploadFile,
  onUploadFileChange,
  figureFiles,
  onFigureFilesChange,
  onUploadFile,
  pdfSplitOpen,
  pdfSplitProgress,
  onPdfSplitConfirm,
  onPdfSplitCancel,
  pptxSplitOpen,
  pptxSplitProgress,
  onPptxSplitConfirm,
  onPptxSplitCancel,
  pdfCompressOpen,
  pdfCompressProgress,
  onPdfCompressConfirm,
  onPdfCompressCancel,
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
  const [dropActive, setDropActive] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [previewFace, setPreviewFace] = useState<DraftPreviewFace>("front");

  useEffect(() => {
    if (!createNotice) return;
    const t = window.setTimeout(() => clearCreateNotice(), 3200);
    return () => window.clearTimeout(t);
  }, [createNotice, clearCreateNotice]);

  useEffect(() => {
    setPreviewFace("front");
  }, [createCard.type]);

  useEffect(() => {
    setDropError(null);
  }, [tab]);

  const methods: AddMaterialTab[] = guest
    ? ["paste", "diy"]
    : ["upload", "paste", "diy"];
  const activeTab =
    tab && methods.includes(tab) ? tab : tab === null ? null : methods[0];

  function onMethodBack() {
    if (returnToChooser) onTabChange(null);
    else onCancel();
  }

  function applyUploadFile(file: File | null) {
    setDropError(null);
    onUploadFileChange(file);
    if (!file || resolveUploadContentType(file) !== "application/pdf") {
      onFigureFilesChange([]);
    }
  }

  function onDropZoneDrop(ev: DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    setDropActive(false);
    const file = ev.dataTransfer.files?.[0] ?? null;
    if (!file) return;
    if (!isAllowedUploadFile(file)) {
      setDropError("Use a PDF, PPTX, or image (JPEG, PNG, WebP).");
      return;
    }
    applyUploadFile(file);
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
      {dropError ? (
        <CreateFlowNotice tone="error" onClose={() => setDropError(null)}>
          {dropError}
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

  const consents = (
    <>
      <PdfSplitConsent
        open={pdfSplitOpen}
        fileName={uploadFile?.name ?? "PDF"}
        figuresWillSkip={figureFiles.length > 0}
        progressLabel={pdfSplitProgress}
        busy={materialBusy}
        onConfirm={onPdfSplitConfirm}
        onCancel={onPdfSplitCancel}
      />
      <PptxSplitConsent
        open={pptxSplitOpen}
        fileName={uploadFile?.name ?? "PPTX"}
        maxMb={fileSizeCapMb()}
        progressLabel={pptxSplitProgress}
        busy={materialBusy}
        onConfirm={onPptxSplitConfirm}
        onCancel={onPptxSplitCancel}
      />
      <PdfCompressConsent
        open={pdfCompressOpen}
        fileName={uploadFile?.name ?? "PDF"}
        progressLabel={pdfCompressProgress}
        busy={materialBusy}
        onConfirm={onPdfCompressConfirm}
        onCancel={onPdfCompressCancel}
      />
    </>
  );

  if (activeTab === null) {
    return (
      <Box key="chooser" sx={panInSx}>
        <Box
          sx={{
            flex: 1,
            width: "100%",
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
            py: { xs: 3, md: 4 },
          }}
        >
          <Stack spacing={2.5} sx={{ width: "100%", maxWidth: 520 }}>
            <StepHeader
              heading="How do you want to start?"
              blurb={
                guest
                  ? "Paste text or write a card. Sign in to upload files."
                  : "Upload notes, paste text, or write a card by hand."
              }
            />
            {alerts}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr",
                  sm: `repeat(${methods.length}, minmax(0, 1fr))`,
                },
                gap: 1.25,
              }}
              role="list"
              aria-label="Create flashcards methods"
            >
              {methods.map((id) => {
                const meta = METHOD_META[id];
                const Icon = meta.Icon;
                return (
                  <ButtonBase
                    key={id}
                    role="listitem"
                    focusRipple
                    onClick={() => onTabChange(id)}
                    aria-label={meta.label}
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 1,
                      p: 1.75,
                      borderRadius: 2,
                      border: "1px solid",
                      borderColor: "rgba(232, 216, 199, 0.16)",
                      bgcolor: "#12070f",
                      textAlign: "left",
                      "&:hover": {
                        borderColor: "primary.main",
                      },
                    }}
                  >
                    <Icon sx={{ fontSize: 26, color: "primary.light" }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {meta.label}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {meta.blurb}
                    </Typography>
                  </ButtonBase>
                );
              })}
            </Box>
            <Stack
              direction="row"
              justifyContent="flex-start"
              alignItems="center"
              sx={{
                pt: 2,
                borderTop: "1px solid",
                borderColor: "rgba(232, 216, 199, 0.12)",
              }}
            >
              <Button onClick={onCancel} sx={FOOTER_BTN_SX}>
                Back
              </Button>
            </Stack>
          </Stack>
        </Box>
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
          alignItems: "center",
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
            <Box component="form" onSubmit={onUploadFile} noValidate>
              <Stack spacing={2.5}>
                <Box
                  onDragEnter={(ev) => {
                    if (materialBusy) return;
                    ev.preventDefault();
                    setDropActive(true);
                  }}
                  onDragOver={(ev) => {
                    if (materialBusy) return;
                    ev.preventDefault();
                    setDropActive(true);
                  }}
                  onDragLeave={(ev) => {
                    ev.preventDefault();
                    if (ev.currentTarget.contains(ev.relatedTarget as Node))
                      return;
                    setDropActive(false);
                  }}
                  onDrop={(ev) => {
                    if (materialBusy) {
                      ev.preventDefault();
                      setDropActive(false);
                      return;
                    }
                    onDropZoneDrop(ev);
                  }}
                  sx={(theme) => ({
                    border: 1,
                    borderStyle: uploadFile ? "solid" : "dashed",
                    borderColor: dropActive
                      ? "primary.main"
                      : uploadFile
                        ? "rgba(232, 216, 199, 0.16)"
                        : "rgba(232, 216, 199, 0.22)",
                    bgcolor: dropActive
                      ? alpha(theme.palette.primary.main, 0.1)
                      : uploadFile
                        ? "rgba(18, 7, 15, 0.45)"
                        : "rgba(18, 7, 15, 0.22)",
                    borderRadius: 2.5,
                    minHeight: uploadFile ? 152 : 188,
                    px: 2.5,
                    py: 3,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1.5,
                    textAlign: "center",
                    opacity: materialBusy ? 0.72 : 1,
                    pointerEvents: materialBusy ? "none" : "auto",
                    transition:
                      "border-color 160ms ease, background-color 160ms ease",
                  })}
                >
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      color: "primary.light",
                      bgcolor: "rgba(91, 44, 111, 0.28)",
                      border: "1px solid",
                      borderColor: "rgba(209, 163, 226, 0.28)",
                    }}
                  >
                    {uploadFile ? (
                      <InsertDriveFileOutlinedIcon sx={{ fontSize: 22 }} />
                    ) : (
                      <UploadFileOutlinedIcon sx={{ fontSize: 22 }} />
                    )}
                  </Box>
                  {uploadFile ? (
                    <Stack
                      spacing={0.75}
                      alignItems="center"
                      sx={{ width: "100%" }}
                    >
                      <Typography
                        component="p"
                        sx={{
                          m: 0,
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          letterSpacing: "0.14em",
                          textTransform: "uppercase",
                          color: "primary.light",
                        }}
                      >
                        {uploadKindLabel(uploadFile)}
                        {" · "}
                        {formatUploadBytes(uploadFile.size)}
                      </Typography>
                      <Typography
                        variant="subtitle1"
                        sx={{
                          fontWeight: 600,
                          lineHeight: 1.35,
                          maxWidth: 360,
                          px: 1,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}
                        title={uploadFile.name}
                      >
                        {uploadFile.name}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Ready to generate
                      </Typography>
                      <Button
                        component="label"
                        disabled={materialBusy}
                        sx={{
                          ...FOOTER_BTN_SX,
                          mt: 0.25,
                          fontSize: "0.8125rem",
                        }}
                      >
                        Replace file
                        <input
                          type="file"
                          accept={UPLOAD_ACCEPT}
                          hidden
                          onChange={(ev) => {
                            applyUploadFile(ev.target.files?.[0] ?? null);
                          }}
                        />
                      </Button>
                    </Stack>
                  ) : (
                    <Stack spacing={1.25} alignItems="center">
                      <Box>
                        <Typography
                          variant="subtitle1"
                          sx={{ fontWeight: 600 }}
                        >
                          Drop PDF, PPTX, or image here
                        </Typography>
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ mt: 0.5 }}
                        >
                          PDF/PPTX max {fileSizeCapMb()}MB · images max{" "}
                          {fileSizeCapMb(MAX_IMAGE_BYTES)}MB
                        </Typography>
                      </Box>
                      <Button
                        variant="contained"
                        component="label"
                        disabled={materialBusy}
                        sx={PRIMARY_PILL_SX}
                      >
                        Choose file
                        <input
                          type="file"
                          accept={UPLOAD_ACCEPT}
                          hidden
                          onChange={(ev) => {
                            applyUploadFile(ev.target.files?.[0] ?? null);
                          }}
                        />
                      </Button>
                    </Stack>
                  )}
                </Box>
                <Stack
                  direction="row"
                  spacing={1.5}
                  justifyContent="space-between"
                  alignItems="center"
                  sx={{
                    pt: 2,
                    borderTop: "1px solid",
                    borderColor: "rgba(232, 216, 199, 0.12)",
                  }}
                >
                  <Button
                    onClick={onMethodBack}
                    disabled={materialBusy}
                    sx={FOOTER_BTN_SX}
                  >
                    Back
                  </Button>
                  {uploadFile ? (
                    <Button
                      type="submit"
                      variant="contained"
                      disabled={materialBusy}
                      sx={PRIMARY_PILL_SX}
                    >
                      {materialBusy
                        ? readingScan
                          ? "Reading scanned pages…"
                          : "Uploading…"
                        : "Start generation"}
                    </Button>
                  ) : null}
                </Stack>
              </Stack>
            </Box>
          ) : null}

          {activeTab === "paste" ? (
            <Box
              component="form"
              onSubmit={guest ? onGuestPaste : onAccountPaste}
              noValidate
            >
              <Stack spacing={2}>
                {!guest ? (
                  <TextField
                    label="Filename (optional)"
                    value={pasteFilename}
                    onChange={(ev) => onPasteFilenameChange(ev.target.value)}
                    fullWidth
                  />
                ) : null}
                <TextField
                  label="Paste text"
                  value={pasteText}
                  onChange={(ev) => onPasteTextChange(ev.target.value)}
                  required
                  fullWidth
                  multiline
                  minRows={6}
                />
                {pasteText.trim() ? (
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={materialBusy}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    {materialBusy ? "Saving…" : "Generate from paste"}
                  </Button>
                ) : null}
              </Stack>
            </Box>
          ) : null}

          {activeTab === "diy" ? (
            <Box component="form" onSubmit={onCreateCard} noValidate>
              <Box
                aria-live="polite"
                sx={{
                  minHeight: 40,
                  mb: 1.5,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <CreateFlowNoticeFade
                  open={Boolean(createError || createNotice)}
                  tone={createError ? "error" : "success"}
                  onClose={
                    createNotice && !createError ? clearCreateNotice : undefined
                  }
                >
                  {createError ? (
                    createError
                  ) : (
                    <>
                      <Box
                        component="span"
                        sx={{ fontWeight: 600, letterSpacing: "0.01em" }}
                      >
                        Card added
                      </Box>
                      <Box
                        component="span"
                        sx={{ color: "text.secondary", fontWeight: 400 }}
                      >
                        {" · "}
                        Write another, or Finish
                      </Box>
                    </>
                  )}
                </CreateFlowNoticeFade>
              </Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: {
                    xs: "1fr",
                    md: "minmax(0, 1.35fr) minmax(220px, 280px)",
                  },
                  gap: { xs: 2.5, md: 4 },
                  alignItems: "start",
                }}
              >
                <Stack spacing={2.25}>
                  <DraftCardEditor
                    card={createCard}
                    disabled={createBusy || createImageBusy}
                    onChange={onCreateChange}
                    allowedTypes={hubDiyAllowedTypes}
                    typePicker="cards"
                    onPreviewFaceChange={setPreviewFace}
                  />
                  {createNeedsImage && !createImageKey ? (
                    <Box
                      sx={{
                        border: 1,
                        borderStyle: "dashed",
                        borderColor: "divider",
                        borderRadius: 2,
                        minHeight: 140,
                        px: 2.5,
                        py: 3,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1.25,
                        textAlign: "center",
                      }}
                    >
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        Add an image
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        JPEG, PNG, or WebP up to 8MB
                      </Typography>
                      <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1}
                        sx={{ mt: 0.5 }}
                      >
                        {deckImageKeys.length > 0 ? (
                          <FormControl
                            size="small"
                            sx={{ minWidth: { sm: 200 } }}
                          >
                            <InputLabel id="hub-diy-image-key-empty">
                              Deck image
                            </InputLabel>
                            <Select
                              labelId="hub-diy-image-key-empty"
                              label="Deck image"
                              value=""
                              disabled={createBusy || createImageBusy}
                              onChange={(ev) =>
                                applyCreateImageKey(String(ev.target.value))
                              }
                            >
                              <MenuItem value="">
                                <em>Select…</em>
                              </MenuItem>
                              {deckImageKeys.map((key) => (
                                <MenuItem key={key} value={key}>
                                  {key.split("/").pop() ?? key}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : null}
                        <Button
                          variant="contained"
                          component="label"
                          disabled={createBusy || createImageBusy}
                        >
                          {createImageBusy ? "Uploading…" : "Upload image"}
                          <input
                            ref={createImageInputRef}
                            type="file"
                            hidden
                            accept="image/jpeg,image/png,image/webp"
                            onChange={(ev) => {
                              const file = ev.target.files?.[0];
                              if (file) void onCreateImageUpload(file);
                            }}
                          />
                        </Button>
                      </Stack>
                    </Box>
                  ) : null}
                  {createNeedsImage && createImageKey ? (
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      spacing={1}
                      alignItems={{ sm: "center" }}
                    >
                      {deckImageKeys.length > 0 ? (
                        <FormControl fullWidth size="small">
                          <InputLabel id="hub-diy-image-key">Image</InputLabel>
                          <Select
                            labelId="hub-diy-image-key"
                            label="Image"
                            value={createImageKey || ""}
                            disabled={createBusy || createImageBusy}
                            onChange={(ev) =>
                              applyCreateImageKey(String(ev.target.value))
                            }
                          >
                            {deckImageKeys.map((key) => (
                              <MenuItem key={key} value={key}>
                                {key.split("/").pop() ?? key}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ flex: 1, minWidth: 0 }}
                          noWrap
                        >
                          {createImageKey.split("/").pop() ?? createImageKey}
                        </Typography>
                      )}
                      <Button
                        variant="outlined"
                        component="label"
                        disabled={createBusy || createImageBusy}
                        sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
                      >
                        {createImageBusy ? "Uploading…" : "Replace image"}
                        <input
                          ref={createImageInputRef}
                          type="file"
                          hidden
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(ev) => {
                            const file = ev.target.files?.[0];
                            if (file) void onCreateImageUpload(file);
                          }}
                        />
                      </Button>
                    </Stack>
                  ) : null}
                </Stack>
                <Box
                  sx={{
                    position: { md: "sticky" },
                    top: { md: 24 },
                    order: { xs: -1, md: 0 },
                    alignSelf: { md: "start" },
                  }}
                >
                  <DiyCardPreview
                    card={createCard}
                    face={previewFace}
                    action={
                      <Button
                        type="submit"
                        variant="contained"
                        disabled={createBusy || createImageBusy}
                        fullWidth
                        sx={{
                          maxWidth: 220,
                          px: 2.5,
                          py: 1.05,
                          borderRadius: 999,
                          textTransform: "none",
                          fontWeight: 600,
                          boxShadow: "none",
                          "&:hover": { boxShadow: "none" },
                        }}
                      >
                        {createBusy ? "Adding…" : "Add card"}
                      </Button>
                    }
                  />
                </Box>
              </Box>
              <Stack
                direction="row"
                spacing={1.5}
                justifyContent="space-between"
                alignItems="center"
                sx={{
                  mt: 3,
                  pt: 2,
                  borderTop: "1px solid",
                  borderColor: "rgba(232, 216, 199, 0.12)",
                }}
              >
                <Button
                  onClick={onMethodBack}
                  disabled={createBusy}
                  sx={{
                    color: "text.secondary",
                    textTransform: "none",
                    fontWeight: 500,
                    px: 0.5,
                    minWidth: 0,
                    "&:hover": {
                      bgcolor: "transparent",
                      color: "text.primary",
                    },
                  }}
                >
                  Back
                </Button>
                {createSessionHasCard ? (
                  <Button
                    type="button"
                    variant="contained"
                    disabled={createBusy}
                    onClick={onCancel}
                    sx={{
                      minWidth: 140,
                      px: 2.5,
                      py: 1.1,
                      borderRadius: 999,
                      textTransform: "none",
                      fontWeight: 600,
                      boxShadow: "none",
                      "&:hover": { boxShadow: "none" },
                    }}
                  >
                    Finish
                  </Button>
                ) : null}
              </Stack>
            </Box>
          ) : null}

          {activeTab === "paste" ? (
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{
                pt: 2,
                borderTop: "1px solid",
                borderColor: "rgba(232, 216, 199, 0.12)",
              }}
            >
              <Button
                onClick={onMethodBack}
                disabled={materialBusy || createBusy}
                sx={FOOTER_BTN_SX}
              >
                Back
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </Box>
      {consents}
    </Box>
  );
}

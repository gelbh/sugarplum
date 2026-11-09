import { useState, type DragEvent, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import DraftCardEditor, {
  type DraftEditorChange,
} from "../components/DraftCardEditor";
import { FigureSuggestPanel } from "../components/FigureSuggestPanel";
import MaterialsList from "../components/MaterialsList";
import { MAX_CLIENT_FIGURES } from "../lib/figureGeometry";
import {
  PPTX_MIME,
  resolveUploadContentType,
  type CardDraftView,
  type CardType,
  type MaterialListItem,
} from "../api/client";

export type AddMaterialTab = "upload" | "paste" | "topic" | "diy";

const UPLOAD_ACCEPT =
  "application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";

const ALLOWED_UPLOAD_TYPES = new Set([
  "application/pdf",
  PPTX_MIME,
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function isAllowedUploadFile(file: File): boolean {
  return ALLOWED_UPLOAD_TYPES.has(resolveUploadContentType(file));
}

type Props = {
  guest: boolean;
  tab: AddMaterialTab;
  onTabChange: (tab: AddMaterialTab) => void;
  materialError: string | null;
  materialNotice: string | null;
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
  topicValue: string;
  onTopicValueChange: (value: string) => void;
  topicBusy: boolean;
  topicError: string | null;
  onTopicGenerate: (e?: FormEvent) => void;
  createCard: CardDraftView;
  createBusy: boolean;
  createImageBusy: boolean;
  createError: string | null;
  createNeedsImage: boolean;
  createImageKey: string;
  deckImageKeys: string[];
  createImageInputRef: React.RefObject<HTMLInputElement | null>;
  onCreateChange: (next: DraftEditorChange) => void;
  onCreateCard: (e?: FormEvent) => void;
  onCreateImageUpload: (file: File) => void;
  applyCreateImageKey: (key: string) => void;
  hubDiyAllowedTypes: CardType[];
  materials: MaterialListItem[];
  onMaterialsChanged: () => void;
  draftCount: number;
  onReviewDrafts: () => void;
};

export default function AddMaterialWorkshop({
  guest,
  tab,
  onTabChange,
  materialError,
  materialNotice,
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
  topicValue,
  onTopicValueChange,
  topicBusy,
  topicError,
  onTopicGenerate,
  createCard,
  createBusy,
  createImageBusy,
  createError,
  createNeedsImage,
  createImageKey,
  deckImageKeys,
  createImageInputRef,
  onCreateChange,
  onCreateCard,
  onCreateImageUpload,
  applyCreateImageKey,
  hubDiyAllowedTypes,
  materials,
  onMaterialsChanged,
  draftCount,
  onReviewDrafts,
}: Props) {
  const [dropActive, setDropActive] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const tabs: AddMaterialTab[] = guest
    ? ["paste", "diy"]
    : ["upload", "paste", "topic", "diy"];
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

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

  return (
    <Stack spacing={2}>
      {materialError ? <Alert severity="error">{materialError}</Alert> : null}
      {materialNotice ? <Alert severity="success">{materialNotice}</Alert> : null}
      {dropError ? (
        <Alert severity="error" onClose={() => setDropError(null)}>
          {dropError}
        </Alert>
      ) : null}
      {guest ? (
        <Alert severity="info">
          Cards stay in this browser only. Sign in for uploads and AI
          generation.
        </Alert>
      ) : null}

      <Tabs
        value={activeTab}
        onChange={(_ev, v: AddMaterialTab) => onTabChange(v)}
        aria-label="Add material tabs"
        variant="scrollable"
        allowScrollButtonsMobile
      >
        {!guest ? <Tab value="upload" label="Upload" /> : null}
        <Tab value="paste" label="Paste" />
        {!guest ? <Tab value="topic" label="Topic" /> : null}
        <Tab value="diy" label="DIY card" />
      </Tabs>

      {activeTab === "upload" && !guest ? (
        <Box component="form" onSubmit={onUploadFile} noValidate>
          <Stack spacing={2}>
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
                if (ev.currentTarget.contains(ev.relatedTarget as Node)) return;
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
                border: 2,
                borderStyle: "dashed",
                borderColor: dropActive ? "primary.main" : "divider",
                bgcolor: dropActive
                  ? alpha(theme.palette.primary.main, 0.1)
                  : "background.paper",
                borderRadius: 2,
                minHeight: 148,
                px: 3,
                py: 3,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                textAlign: "center",
                opacity: materialBusy ? 0.7 : 1,
                pointerEvents: materialBusy ? "none" : "auto",
              })}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {uploadFile
                  ? uploadFile.name
                  : "Drop PDF, PPTX, or image here"}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                or choose a file from your device
              </Typography>
              <Button
                variant="outlined"
                component="label"
                disabled={materialBusy}
                sx={{ mt: 1, px: 3, py: 1.25 }}
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
            </Box>
            {uploadFile &&
            resolveUploadContentType(uploadFile) === "application/pdf" ? (
              <Stack spacing={1.5}>
                <FigureSuggestPanel
                  pdfFile={uploadFile}
                  disabled={materialBusy}
                  crops={figureFiles}
                  onCropsChange={onFigureFilesChange}
                />
                <Typography variant="caption" color="text.secondary">
                  Optional: Suggest or drag-crop figures on-device. Accept
                  appends up to {MAX_CLIENT_FIGURES} PNG crops.
                </Typography>
              </Stack>
            ) : null}
            <Button
              type="submit"
              variant="contained"
              disabled={materialBusy || !uploadFile}
            >
              {materialBusy
                ? readingScan
                  ? "Reading scanned pages"
                  : "Uploading…"
                : "Upload"}
            </Button>
          </Stack>
        </Box>
      ) : null}

      {activeTab === "paste" ? (
        guest ? (
          <Box component="form" onSubmit={onGuestPaste} noValidate>
            <Stack spacing={2}>
              <TextField
                label="Paste text"
                value={pasteText}
                onChange={(ev) => onPasteTextChange(ev.target.value)}
                required
                fullWidth
                multiline
                minRows={5}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={materialBusy || !pasteText.trim()}
              >
                {materialBusy ? "Saving…" : "Save paste"}
              </Button>
            </Stack>
          </Box>
        ) : (
          <Box component="form" onSubmit={onAccountPaste} noValidate>
            <Stack spacing={2}>
              <TextField
                label="Filename (optional)"
                value={pasteFilename}
                onChange={(ev) => onPasteFilenameChange(ev.target.value)}
                fullWidth
              />
              <TextField
                label="Paste text"
                value={pasteText}
                onChange={(ev) => onPasteTextChange(ev.target.value)}
                required
                fullWidth
                multiline
                minRows={5}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={materialBusy || !pasteText.trim()}
              >
                {materialBusy ? "Saving…" : "Save paste"}
              </Button>
            </Stack>
          </Box>
        )
      ) : null}

      {activeTab === "topic" && !guest ? (
        <Box component="form" onSubmit={onTopicGenerate} noValidate>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Topic generate builds a draft job from your latest ready paste or
              PDF on this deck; existing accepted cards stay.
            </Typography>
            {topicError ? <Alert severity="error">{topicError}</Alert> : null}
            <TextField
              label="Topic"
              value={topicValue}
              onChange={(ev) => onTopicValueChange(ev.target.value)}
              required
              fullWidth
              disabled={topicBusy}
              inputProps={{ maxLength: 200 }}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={topicBusy || !topicValue.trim()}
            >
              {topicBusy ? "Starting…" : "Generate"}
            </Button>
          </Stack>
        </Box>
      ) : null}

      {activeTab === "diy" ? (
        <Box component="form" onSubmit={onCreateCard} noValidate>
          <Stack spacing={2}>
            {createError ? <Alert severity="error">{createError}</Alert> : null}
            {createNeedsImage ? (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  Image (deck material)
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  {deckImageKeys.length > 0 ? (
                    <FormControl fullWidth size="small">
                      <InputLabel id="hub-diy-image-key">
                        Existing image
                      </InputLabel>
                      <Select
                        labelId="hub-diy-image-key"
                        label="Existing image"
                        value={createImageKey || ""}
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
                    variant="outlined"
                    component="label"
                    disabled={createBusy || createImageBusy}
                    sx={{ flexShrink: 0, whiteSpace: "nowrap" }}
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
              </Stack>
            ) : null}
            <DraftCardEditor
              card={createCard}
              disabled={createBusy || createImageBusy}
              onChange={onCreateChange}
              allowedTypes={hubDiyAllowedTypes}
            />
            <Button
              type="submit"
              variant="contained"
              disabled={createBusy || createImageBusy}
            >
              {createBusy ? "Adding…" : "Add card"}
            </Button>
          </Stack>
        </Box>
      ) : null}

      {!guest && materials.length > 0 ? (
        <Box>
          <Typography
            variant="subtitle2"
            sx={{ fontWeight: 600, mb: 1, color: "primary.main" }}
          >
            Materials on this deck
          </Typography>
          <MaterialsList
            materials={materials}
            showDeckTitle={false}
            onChanged={onMaterialsChanged}
          />
        </Box>
      ) : null}

      {draftCount > 0 ? (
        <Button variant="text" onClick={onReviewDrafts} sx={{ alignSelf: "flex-start" }}>
          Also review drafts ({draftCount})
        </Button>
      ) : null}
    </Stack>
  );
}

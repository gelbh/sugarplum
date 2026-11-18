import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

import {
  resolveUploadContentType,
  type Deck,
  type FigureExtractMode,
  type Subject,
} from "../api/client";
import { MAX_CLIENT_FIGURES } from "../lib/figureGeometry";
import { fileSizeCapMb } from "../lib/materialUploadLimits";
import {
  SOURCE_ROLES,
  SOURCE_ROLE_LABELS,
  suggestSourceRole,
  type SourceRole,
} from "../lib/sourceRole";
import { SOURCE_ROLE_ICONS } from "../lib/sourceRoleIcons";
import { CreateMaterialDeckStep } from "../materials/CreateMaterialDeckStep";
import { CreateMaterialDoneStep } from "../materials/CreateMaterialDoneStep";
import { useCreateMaterialDeckStep } from "../materials/useCreateMaterialDeckStep";
import { useCreateMaterialPaste } from "../materials/useCreateMaterialPaste";
import { useCreateMaterialUpload } from "../materials/useCreateMaterialUpload";
import { FigureSuggestPanel } from "./FigureSuggestPanel";
import PdfCompressConsent from "./PdfCompressConsent";
import PdfSplitConsent from "./PdfSplitConsent";
import PptxSplitConsent from "./PptxSplitConsent";
import { SelectEnumItem, renderSelectEnumValue } from "./SelectEnumItem";
import { stepperSx } from "./stepperSx";

type Props = {
  decks: Deck[];
  setDecks: (updater: (prev: Deck[]) => Deck[]) => void;
  subjects?: Subject[];
  setSubjects?: (updater: (prev: Subject[]) => Subject[]) => void;
  deckChipsBySubjectId?: Record<string, string[]>;
  activeStep: number;
  setActiveStep: (n: number) => void;
  onChanged?: () => void | Promise<void>;
  /** Guest: local paste into browser storage; uploads/AI need a signed-in account. */
  localOnly?: boolean;
};

export default function CreateMaterialStepper({
  decks,
  setDecks,
  subjects: subjectsProp,
  setSubjects: setSubjectsProp,
  deckChipsBySubjectId = {},
  activeStep,
  setActiveStep,
  onChanged,
  localOnly = false,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingScan, setReadingScan] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobReused, setJobReused] = useState(false);
  const [sourceRole, setSourceRole] = useState<SourceRole>("lecture");
  const [alsoCover, setAlsoCover] = useState("");
  const [tab, setTab] = useState<"paste" | "file">("paste");

  const deck = useCreateMaterialDeckStep({
    decks,
    setDecks,
    subjectsProp,
    setSubjectsProp,
    deckChipsBySubjectId,
    activeStep,
    setActiveStep,
    onChanged,
    setError,
    setNotice,
    setBusy,
  });

  const paste = useCreateMaterialPaste({
    decks,
    selectedDeckId: deck.selectedDeckId,
    alsoCover,
    setAlsoCover,
    sourceRole,
    setSourceRole,
    setActiveStep,
    onChanged,
    setError,
    setNotice,
    setBusy,
    setJobId,
  });

  const upload = useCreateMaterialUpload({
    selectedDeckId: deck.selectedDeckId,
    alsoCover,
    setAlsoCover,
    sourceRole,
    setSourceRole,
    busy,
    setBusy,
    setActiveStep,
    setError,
    setNotice,
    setJobId,
    setJobReused,
    setReadingScan,
  });

  const steps = ["Deck", "Material", "Done"] as const;

  const alsoCoverField = (
    <TextField
      label="Learning objectives (optional)"
      name="alsoCover"
      value={alsoCover}
      onChange={(ev) => setAlsoCover(ev.target.value)}
      fullWidth
      multiline
      minRows={2}
      helperText="One objective or focus topic per line, up to 20"
    />
  );

  const sourceRoleField = (
    <FormControl fullWidth>
      <InputLabel id="material-source-role-label">Source role</InputLabel>
      <Select
        labelId="material-source-role-label"
        label="Source role"
        value={sourceRole}
        onChange={(ev) => setSourceRole(ev.target.value as SourceRole)}
        renderValue={(value) =>
          renderSelectEnumValue({
            icon: SOURCE_ROLE_ICONS[value as SourceRole],
            label: SOURCE_ROLE_LABELS[value as SourceRole],
          })
        }
      >
        {SOURCE_ROLES.map((role) => (
          <MenuItem key={role} value={role}>
            <SelectEnumItem
              icon={SOURCE_ROLE_ICONS[role]}
              label={SOURCE_ROLE_LABELS[role]}
            />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <Box>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {notice ? <Alert severity="success">{notice}</Alert> : null}

      <Stepper activeStep={activeStep} alternativeLabel sx={stepperSx}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ mt: 2 }}>
        {activeStep === 0 ? (
          <CreateMaterialDeckStep
            decks={decks}
            subjects={deck.subjects}
            selectedDeckId={deck.selectedDeckId}
            setSelectedDeckId={deck.setSelectedDeckId}
            selectedSubjectId={deck.selectedSubjectId}
            setSelectedSubjectId={deck.setSelectedSubjectId}
            newSubjectTitle={deck.newSubjectTitle}
            setNewSubjectTitle={deck.setNewSubjectTitle}
            title={deck.title}
            setTitle={deck.setTitle}
            titleRef={deck.titleRef}
            showNewDeckForm={deck.showNewDeckForm}
            setShowNewDeckForm={deck.setShowNewDeckForm}
            setFocusCreateTitle={deck.setFocusCreateTitle}
            creatingNewSubject={deck.creatingNewSubject}
            canCreateDeck={deck.canCreateDeck}
            subjectDeckChips={deck.subjectDeckChips}
            busy={busy}
            setActiveStep={setActiveStep}
            onCreateDeck={deck.onCreateDeck}
          />
        ) : null}

        {activeStep === 1 && localOnly ? (
          <Stack spacing={2}>
            <Alert severity="info">
              Cards stay in this browser only. Sign in for uploads and AI
              generation.
            </Alert>
            <Box component="form" onSubmit={paste.onGuestPaste} noValidate>
              <Stack spacing={2}>
                {deck.deckSelect("guest-deck-select-label")}
                <TextField
                  label="Paste text"
                  name="text"
                  value={paste.pasteText}
                  onChange={(ev) => paste.setPasteText(ev.target.value)}
                  required
                  fullWidth
                  multiline
                  minRows={6}
                />
                <Typography variant="caption" color="text.secondary">
                  File upload is available after you sign in.
                </Typography>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={
                    busy || !deck.selectedDeckId || !paste.pasteText.trim()
                  }
                >
                  {busy ? "Saving…" : "Save paste"}
                </Button>
              </Stack>
            </Box>
          </Stack>
        ) : null}

        {activeStep === 1 && !localOnly && (
          <Box>
            <Tabs
              value={tab}
              onChange={(_ev, v) => setTab(v)}
              aria-label="material-type-tabs"
              sx={{ mb: 2 }}
            >
              <Tab value="paste" label="Paste" />
              <Tab value="file" label="Upload" />
            </Tabs>

            {tab === "paste" && (
              <Box component="form" onSubmit={paste.onPaste} noValidate>
                <Stack spacing={2}>
                  {deck.deckSelect("deck-select-label")}
                  <TextField
                    label="Filename (optional)"
                    name="filename"
                    value={paste.filename}
                    onChange={(ev) => {
                      const next = ev.target.value;
                      paste.setFilename(next);
                      setSourceRole(suggestSourceRole(next));
                    }}
                    fullWidth
                  />
                  {sourceRoleField}
                  <TextField
                    label="Paste text"
                    name="text"
                    value={paste.pasteText}
                    onChange={(ev) => paste.setPasteText(ev.target.value)}
                    required
                    fullWidth
                    multiline
                    minRows={6}
                  />
                  {alsoCoverField}
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={
                      busy || !deck.selectedDeckId || !paste.pasteText.trim()
                    }
                  >
                    {busy ? "Saving…" : "Save paste"}
                  </Button>
                </Stack>
              </Box>
            )}

            {tab === "file" && (
              <Box component="form" onSubmit={upload.onUploadFile} noValidate>
                <Stack spacing={2}>
                  {deck.deckSelect("file-deck-select-label")}
                  <Button
                    variant="outlined"
                    component="label"
                    disabled={busy || !deck.selectedDeckId}
                  >
                    {upload.uploadFile
                      ? upload.uploadFile.name
                      : "Choose PDF, PPTX, or image"}
                    <input
                      type="file"
                      accept="application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      hidden
                      onChange={(ev) => {
                        const file = ev.target.files?.[0] ?? null;
                        upload.setUploadFile(file);
                        setSourceRole(suggestSourceRole(file?.name ?? null));
                        if (
                          !file ||
                          resolveUploadContentType(file) !== "application/pdf"
                        ) {
                          upload.setFigureFiles([]);
                        }
                      }}
                    />
                  </Button>
                  {sourceRoleField}
                  {upload.uploadFile &&
                  resolveUploadContentType(upload.uploadFile) ===
                    "application/pdf" ? (
                    <Stack spacing={1.5}>
                      <FigureSuggestPanel
                        pdfFile={upload.uploadFile}
                        disabled={busy || !deck.selectedDeckId}
                        crops={upload.figureFiles}
                        onCropsChange={upload.setFigureFiles}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Optional: Suggest or drag-crop figures on-device. Accept
                        appends up to {MAX_CLIENT_FIGURES} PNG crops.
                      </Typography>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={upload.figureExtractMode}
                        onChange={(_e, value: FigureExtractMode | null) => {
                          if (value) upload.setFigureExtractMode(value);
                        }}
                        aria-label="Figure extract mode"
                        color="primary"
                        disabled={busy}
                      >
                        <ToggleButton value="fast">Fast</ToggleButton>
                        <ToggleButton value="accurate">Accurate</ToggleButton>
                      </ToggleButtonGroup>
                      {upload.figureExtractMode === "accurate" ? (
                        <Typography variant="caption" color="text.secondary">
                          Better automatic figures; may take several minutes
                          while the extractor starts.
                        </Typography>
                      ) : null}
                    </Stack>
                  ) : null}
                  <Typography variant="caption" color="text.secondary">
                    PDF/PPTX max 50MB; images max 8MB.
                    {upload.submitLabel === "Continue"
                      ? " Free-path images open occlusion from the deck hub (or add a BYO key for auto vision)."
                      : " Upload starts generation when complete."}
                  </Typography>
                  {upload.offerLearningObjectives ? alsoCoverField : null}
                  {!upload.offerLearningObjectives &&
                  upload.freePathImageHelper ? (
                    <Typography variant="body2" color="text.secondary">
                      {upload.freePathImageHelper}
                    </Typography>
                  ) : null}
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={
                      upload.submitDisabled ||
                      !deck.selectedDeckId ||
                      !upload.uploadFile
                    }
                  >
                    {busy
                      ? readingScan
                        ? "Reading scanned pages"
                        : "Uploading…"
                      : upload.submitLabel}
                  </Button>
                </Stack>
              </Box>
            )}
          </Box>
        )}

        <PdfSplitConsent
          open={upload.pdfSplitOpen}
          fileName={upload.uploadFile?.name ?? "PDF"}
          maxMb={fileSizeCapMb()}
          figuresWillSkip={upload.figureFiles.length > 0}
          progressLabel={upload.pdfSplitProgress}
          busy={busy}
          onConfirm={() => {
            void upload.onPdfSplitConfirm();
          }}
          onCancel={upload.onPdfSplitCancel}
        />

        <PptxSplitConsent
          open={upload.pptxSplitOpen}
          fileName={upload.uploadFile?.name ?? "PPTX"}
          maxMb={fileSizeCapMb()}
          progressLabel={upload.pptxSplitProgress}
          busy={busy}
          onConfirm={() => {
            void upload.onPptxSplitConfirm();
          }}
          onCancel={upload.onPptxSplitCancel}
        />

        <PdfCompressConsent
          open={upload.pdfCompressOpen}
          fileName={upload.uploadFile?.name ?? "PDF"}
          maxMb={fileSizeCapMb()}
          progressLabel={upload.pdfCompressProgress}
          busy={busy}
          onConfirm={() => {
            void upload.onPdfCompressConfirm();
          }}
          onCancel={upload.onPdfCompressCancel}
        />

        {activeStep === 2 ? (
          <CreateMaterialDoneStep
            jobId={jobId}
            jobReused={jobReused}
            localOnly={localOnly}
            setActiveStep={setActiveStep}
          />
        ) : null}
      </Box>
    </Box>
  );
}

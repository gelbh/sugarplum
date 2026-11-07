import { useEffect, useRef, useState, type FormEvent } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stepper from "@mui/material/Stepper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import Alert from "@mui/material/Alert";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RateReviewIcon from "@mui/icons-material/RateReview";

import {
  createDeck,
  createSubject,
  listSubjects,
  pasteMaterial,
  PPTX_MIME,
  resolveUploadContentType,
  topicHintsFromLines,
  uploadMaterialFile,
  uploadPdfWithFigureCrops,
  type Deck,
  type FigureExtractMode,
  type Subject,
  ApiError,
} from "../api/client";
import { guestPasteToCards } from "../guest/pasteToCards";
import { guestAddAcceptedCards } from "../guest/store";
import { MAX_CLIENT_FIGURES } from "../lib/figureGeometry";
import { FigureSuggestPanel } from "./FigureSuggestPanel";
import { stepperSx } from "./stepperSx";

type Props = {
  decks: Deck[];
  setDecks: (updater: (prev: Deck[]) => Deck[]) => void;
  subjects?: Subject[];
  setSubjects?: (updater: (prev: Subject[]) => Subject[]) => void;
  /** Calendar deck-title chips keyed by linked subject id. */
  deckChipsBySubjectId?: Record<string, string[]>;
  activeStep: number;
  setActiveStep: (n: number) => void;
  onChanged?: () => void | Promise<void>;
  /** Guest: local paste into browser storage; uploads/AI need a signed-in account. */
  localOnly?: boolean;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_UPLOAD_MIMES = new Set([
  "application/pdf",
  PPTX_MIME,
  ...IMAGE_MIMES,
]);
const CREATE_NEW_DECK = "__create_new_deck__";
const CREATE_NEW_SUBJECT = "__create_new_subject__";

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
  const [localSubjects, setLocalSubjects] = useState<Subject[]>([]);
  const subjects = subjectsProp ?? localSubjects;
  const setSubjects = setSubjectsProp ?? setLocalSubjects;

  const [title, setTitle] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [newSubjectTitle, setNewSubjectTitle] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [filename, setFilename] = useState("");
  const [alsoCover, setAlsoCover] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [figureFiles, setFigureFiles] = useState<File[]>([]);
  const [figureExtractMode, setFigureExtractMode] =
    useState<FigureExtractMode>("fast");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [readingScan, setReadingScan] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [focusCreateTitle, setFocusCreateTitle] = useState(false);
  const [showNewDeckForm, setShowNewDeckForm] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (subjectsProp) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await listSubjects();
        if (!cancelled) setLocalSubjects(list);
      } catch {
        /* subject list optional until create */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectsProp]);

  useEffect(() => {
    setSelectedDeckId((prev) =>
      prev && decks.some((d) => d.id === prev) ? prev : (decks[0]?.id ?? ""),
    );
  }, [decks]);

  useEffect(() => {
    setSelectedSubjectId((prev) => {
      if (prev === CREATE_NEW_SUBJECT) return prev;
      if (prev && subjects.some((s) => s.id === prev)) return prev;
      return subjects[0]?.id ?? CREATE_NEW_SUBJECT;
    });
  }, [subjects]);

  useEffect(() => {
    if (focusCreateTitle && activeStep === 0) {
      titleRef.current?.focus();
      setFocusCreateTitle(false);
    }
  }, [focusCreateTitle, activeStep]);

  function onDeckSelect(value: string) {
    if (value === CREATE_NEW_DECK) {
      setActiveStep(0);
      setShowNewDeckForm(true);
      setFocusCreateTitle(true);
      return;
    }
    setSelectedDeckId(value);
  }

  function deckSelect(labelId: string) {
    return (
      <FormControl fullWidth>
        <InputLabel id={labelId}>Deck</InputLabel>
        <Select
          labelId={labelId}
          label="Deck"
          value={selectedDeckId}
          onChange={(ev) => onDeckSelect(ev.target.value)}
          displayEmpty={decks.length === 0}
          renderValue={(value) => {
            if (!value) return "Choose a deck";
            return decks.find((d) => d.id === value)?.title ?? "Choose a deck";
          }}
        >
          {decks.map((d) => (
            <MenuItem key={d.id} value={d.id}>
              {d.title}
            </MenuItem>
          ))}
          {decks.length > 0 ? <Divider component="li" /> : null}
          <MenuItem value={CREATE_NEW_DECK}>Create new deck…</MenuItem>
        </Select>
      </FormControl>
    );
  }

  const creatingNewSubject = selectedSubjectId === CREATE_NEW_SUBJECT;
  const canCreateDeck =
    Boolean(title.trim()) &&
    (creatingNewSubject
      ? Boolean(newSubjectTitle.trim())
      : Boolean(selectedSubjectId));
  const subjectDeckChips =
    !creatingNewSubject && selectedSubjectId
      ? (deckChipsBySubjectId[selectedSubjectId] ?? [])
      : [];

  const [tab, setTab] = useState<"paste" | "file">("paste");

  async function onCreateDeck(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    if (!canCreateDeck) {
      setError(
        creatingNewSubject
          ? "Enter a subject title and deck title"
          : "Choose a subject and enter a deck title",
      );
      return;
    }
    setBusy(true);
    try {
      let subjectId = selectedSubjectId;
      if (creatingNewSubject) {
        const created = await createSubject(newSubjectTitle.trim());
        setSubjects((prev) => [...prev, created]);
        subjectId = created.id;
        setSelectedSubjectId(created.id);
        setNewSubjectTitle("");
      }
      const deck = await createDeck(title.trim(), subjectId);
      setDecks((prev) => [...prev, deck]);
      setSelectedDeckId(deck.id);
      setTitle("");
      setShowNewDeckForm(false);
      setNotice(`Created “${deck.title}”`);
      setActiveStep(1);
      await onChanged?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create deck");
    } finally {
      setBusy(false);
    }
  }

  async function onGuestPaste(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setJobId(null);
    if (!selectedDeckId) {
      setError("Select a deck first");
      return;
    }
    const { cards: pairs, truncated } = guestPasteToCards(pasteText);
    if (pairs.length === 0) {
      setError(
        "Paste needs clearer paragraphs or Q&A lines (blank line between cards).",
      );
      return;
    }
    setBusy(true);
    try {
      const added = guestAddAcceptedCards(selectedDeckId, pairs);
      if (added.length === 0) {
        setError("Deck missing or could not save. Pick a deck and try again.");
        return;
      }
      const deckTitle =
        decks.find((d) => d.id === selectedDeckId)?.title ?? "deck";
      setPasteText("");
      const truncNote = truncated
        ? ` (kept first ${added.length}; paste was longer than the 40-card limit)`
        : "";
      setNotice(
        `Added ${added.length} local cards to “${deckTitle}”${truncNote}`,
      );
      try {
        await onChanged?.();
      } catch {
        /* refresh must not look like a save failure */
      }
      // After journey sync (which only maps to steps 0/1), lock Done.
      setActiveStep(2);
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "QuotaExceededError" || err.code === 22)
      ) {
        setError(
          "Browser storage is full. Shorten the paste or clear guest data, then try again.",
        );
      } else {
        setError("Could not save local cards");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPaste(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setJobId(null);
    if (!selectedDeckId) {
      setError("Select a deck first");
      return;
    }
    setBusy(true);
    try {
      const topicHints = topicHintsFromLines(alsoCover);
      const material = await pasteMaterial(selectedDeckId, {
        text: pasteText,
        ...(filename.trim() ? { filename: filename.trim() } : {}),
        ...(topicHints ? { topicHints } : {}),
      });
      setPasteText("");
      setFilename("");
      setAlsoCover("");
      if (material.jobId) {
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setNotice(`Saved paste material (${material.status})`);
      setActiveStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save paste");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadFile(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setJobId(null);
    if (!selectedDeckId) {
      setError("Select a deck first");
      return;
    }
    if (!uploadFile) {
      setError("Choose a PDF, PPTX, or image file");
      return;
    }
    const contentType = resolveUploadContentType(uploadFile);
    if (!ALLOWED_UPLOAD_MIMES.has(contentType)) {
      setError("Only PDF, PPTX, or image (jpeg/png/webp) files are allowed");
      return;
    }
    if (uploadFile.size > MAX_FILE_BYTES) {
      setError("File must be 25MB or smaller");
      return;
    }
    if (IMAGE_MIMES.has(contentType) && uploadFile.size > MAX_IMAGE_BYTES) {
      setError("Images for generation must be 8MB or smaller");
      return;
    }
    if (figureFiles.length > MAX_CLIENT_FIGURES) {
      setError(`Attach at most ${MAX_CLIENT_FIGURES} figure crops`);
      return;
    }
    for (const figure of figureFiles) {
      if (resolveUploadContentType(figure) !== "image/png") {
        setError("Figure crops must be PNG images");
        return;
      }
      if (figure.size > MAX_IMAGE_BYTES) {
        setError("Figure crops must be 8MB or smaller");
        return;
      }
    }
    setBusy(true);
    try {
      const topicHints = topicHintsFromLines(alsoCover);
      const pdfOpts =
        contentType === "application/pdf"
          ? {
              figureExtractMode,
              ...(topicHints ? { topicHints } : {}),
            }
          : topicHints
            ? { topicHints }
            : undefined;
      const material =
        contentType === "application/pdf" && figureFiles.length > 0
          ? await uploadPdfWithFigureCrops(
              selectedDeckId,
              uploadFile,
              figureFiles,
              undefined,
              { ...pdfOpts, onScan: () => setReadingScan(true) },
            )
          : await uploadMaterialFile(selectedDeckId, uploadFile, undefined, {
              ...pdfOpts,
              onScan: () => setReadingScan(true),
            });
      setUploadFile(null);
      setFigureFiles([]);
      setAlsoCover("");
      if (material.jobId) {
        setJobId(material.jobId);
        setNotice(`Stored file (${material.status}). Generation started.`);
        setActiveStep(2);
      } else {
        setNotice(
          `Stored file (${material.status}). Open drafts from a prior generate, or upload a new file.`,
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload file");
    } finally {
      setBusy(false);
      setReadingScan(false);
    }
  }

  const steps = ["Deck", "Material", "Done"] as const;

  const alsoCoverField = (
    <TextField
      label="Also cover (optional)"
      name="alsoCover"
      value={alsoCover}
      onChange={(ev) => setAlsoCover(ev.target.value)}
      fullWidth
      multiline
      minRows={2}
      helperText="One topic per line, up to 5"
    />
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
        {activeStep === 0 && (
          <Stack spacing={3}>
            {decks.length > 0 ? (
              <Stack spacing={2}>
                <Typography variant="h6">Choose a deck</Typography>
                <FormControl fullWidth>
                  <InputLabel id="existing-deck-label">
                    Existing deck
                  </InputLabel>
                  <Select
                    labelId="existing-deck-label"
                    label="Existing deck"
                    value={selectedDeckId}
                    onChange={(ev) => setSelectedDeckId(ev.target.value)}
                  >
                    {decks.map((d) => (
                      <MenuItem key={d.id} value={d.id}>
                        {d.title}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  disabled={!selectedDeckId}
                  onClick={() => setActiveStep(1)}
                >
                  Continue with this deck
                </Button>
                {!showNewDeckForm ? (
                  <Button
                    variant="text"
                    onClick={() => {
                      setShowNewDeckForm(true);
                      setFocusCreateTitle(true);
                    }}
                  >
                    Create new deck…
                  </Button>
                ) : null}
              </Stack>
            ) : null}
            {decks.length === 0 || showNewDeckForm ? (
              <Box component="form" onSubmit={onCreateDeck} noValidate>
                <Stack spacing={2}>
                  <Typography variant="h6">
                    {decks.length > 0 ? "New deck" : "Create a deck"}
                  </Typography>
                  <FormControl fullWidth>
                    <InputLabel id="new-deck-subject-label">Subject</InputLabel>
                    <Select
                      labelId="new-deck-subject-label"
                      label="Subject"
                      value={selectedSubjectId}
                      onChange={(ev) => setSelectedSubjectId(ev.target.value)}
                    >
                      {subjects.map((s) => (
                        <MenuItem key={s.id} value={s.id}>
                          {s.title}
                        </MenuItem>
                      ))}
                      {subjects.length > 0 ? <Divider component="li" /> : null}
                      <MenuItem value={CREATE_NEW_SUBJECT}>
                        Create new subject…
                      </MenuItem>
                    </Select>
                  </FormControl>
                  {creatingNewSubject ? (
                    <TextField
                      label="New subject title"
                      name="subjectTitle"
                      value={newSubjectTitle}
                      onChange={(ev) => setNewSubjectTitle(ev.target.value)}
                      required
                      fullWidth
                    />
                  ) : null}
                  {subjectDeckChips.length > 0 ? (
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {subjectDeckChips.map((chip) => (
                        <Button
                          key={chip}
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            setTitle(chip);
                            setShowNewDeckForm(true);
                            setFocusCreateTitle(true);
                          }}
                        >
                          {chip}
                        </Button>
                      ))}
                    </Stack>
                  ) : null}
                  <TextField
                    label="Deck title"
                    name="title"
                    value={title}
                    onChange={(ev) => setTitle(ev.target.value)}
                    required
                    fullWidth
                    inputRef={titleRef}
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={busy || !canCreateDeck}
                  >
                    {busy ? "Working…" : "Create deck"}
                  </Button>
                </Stack>
              </Box>
            ) : null}
          </Stack>
        )}

        {activeStep === 1 && localOnly ? (
          <Stack spacing={2}>
            <Alert severity="info">
              Cards stay in this browser only. Sign in for uploads and AI
              generation.
            </Alert>
            <Box component="form" onSubmit={onGuestPaste} noValidate>
              <Stack spacing={2}>
                {deckSelect("guest-deck-select-label")}
                <TextField
                  label="Paste text"
                  name="text"
                  value={pasteText}
                  onChange={(ev) => setPasteText(ev.target.value)}
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
                  disabled={busy || !selectedDeckId || !pasteText.trim()}
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
              <Box component="form" onSubmit={onPaste} noValidate>
                <Stack spacing={2}>
                  {deckSelect("deck-select-label")}
                  <TextField
                    label="Filename (optional)"
                    name="filename"
                    value={filename}
                    onChange={(ev) => setFilename(ev.target.value)}
                    fullWidth
                  />
                  <TextField
                    label="Paste text"
                    name="text"
                    value={pasteText}
                    onChange={(ev) => setPasteText(ev.target.value)}
                    required
                    fullWidth
                    multiline
                    minRows={6}
                  />
                  {alsoCoverField}
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={busy || !selectedDeckId || !pasteText.trim()}
                  >
                    {busy ? "Saving…" : "Save paste"}
                  </Button>
                </Stack>
              </Box>
            )}

            {tab === "file" && (
              <Box component="form" onSubmit={onUploadFile} noValidate>
                <Stack spacing={2}>
                  {deckSelect("file-deck-select-label")}
                  <Button
                    variant="outlined"
                    component="label"
                    disabled={busy || !selectedDeckId}
                  >
                    {uploadFile
                      ? uploadFile.name
                      : "Choose PDF, PPTX, or image"}
                    <input
                      type="file"
                      accept="application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      hidden
                      onChange={(ev) => {
                        const file = ev.target.files?.[0] ?? null;
                        setUploadFile(file);
                        if (
                          !file ||
                          resolveUploadContentType(file) !== "application/pdf"
                        ) {
                          setFigureFiles([]);
                        }
                      }}
                    />
                  </Button>
                  {uploadFile &&
                  resolveUploadContentType(uploadFile) === "application/pdf" ? (
                    <Stack spacing={1.5}>
                      <FigureSuggestPanel
                        pdfFile={uploadFile}
                        disabled={busy || !selectedDeckId}
                        crops={figureFiles}
                        onCropsChange={setFigureFiles}
                      />
                      <Typography variant="caption" color="text.secondary">
                        Optional: Suggest or drag-crop figures on-device. Accept
                        appends up to {MAX_CLIENT_FIGURES} PNG crops.
                      </Typography>
                      <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={figureExtractMode}
                        onChange={(_e, value: FigureExtractMode | null) => {
                          if (value) setFigureExtractMode(value);
                        }}
                        aria-label="Figure extract mode"
                        color="primary"
                        disabled={busy}
                      >
                        <ToggleButton value="fast">Fast</ToggleButton>
                        <ToggleButton value="accurate">Accurate</ToggleButton>
                      </ToggleButtonGroup>
                      {figureExtractMode === "accurate" ? (
                        <Typography variant="caption" color="text.secondary">
                          Better automatic figures; may take several minutes
                          while the extractor starts.
                        </Typography>
                      ) : null}
                    </Stack>
                  ) : null}
                  <Typography variant="caption" color="text.secondary">
                    PDF/PPTX max 25MB; images max 8MB. Upload starts generation
                    when complete.
                  </Typography>
                  {alsoCoverField}
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={busy || !selectedDeckId || !uploadFile}
                  >
                    {busy
                      ? readingScan
                        ? "Reading scanned pages"
                        : "Uploading…"
                      : "Upload file"}
                  </Button>
                </Stack>
              </Box>
            )}
          </Box>
        )}

        {activeStep === 2 && (
          <Stack spacing={2}>
            <Typography variant="body1">
              {jobId
                ? "Generation started. Review drafts next."
                : localOnly
                  ? "Done. Cards are ready to study."
                  : "Done. Add more material or continue when ready."}
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              {jobId ? (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<RateReviewIcon />}
                  href={`/jobs/${encodeURIComponent(jobId)}/drafts`}
                  aria-label="View drafts"
                >
                  View drafts
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<PlayArrowIcon />}
                  href="/study"
                  aria-label="Study"
                >
                  Study
                </Button>
              )}
              <Button variant="outlined" onClick={() => setActiveStep(0)}>
                Add more
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
    </Box>
  );
}

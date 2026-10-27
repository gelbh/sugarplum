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

import {
  createDeck,
  pasteMaterial,
  PPTX_MIME,
  resolveUploadContentType,
  uploadMaterialFile,
  uploadPdfWithFigureCrops,
  type Deck,
  ApiError,
} from "../api/client";
import { guestPasteToCards } from "../guest/pasteToCards";
import { guestAddAcceptedCards } from "../guest/store";
import { stepperSx } from "./stepperSx";

type Props = {
  decks: Deck[];
  setDecks: (updater: (prev: Deck[]) => Deck[]) => void;
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

export default function CreateMaterialStepper({
  decks,
  setDecks,
  activeStep,
  setActiveStep,
  onChanged,
  localOnly = false,
}: Props) {
  const [title, setTitle] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [filename, setFilename] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [figureFiles, setFigureFiles] = useState<File[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [focusCreateTitle, setFocusCreateTitle] = useState(false);

  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedDeckId((prev) =>
      prev && decks.some((d) => d.id === prev) ? prev : (decks[0]?.id ?? ""),
    );
  }, [decks]);

  useEffect(() => {
    if (focusCreateTitle && activeStep === 0) {
      titleRef.current?.focus();
      setFocusCreateTitle(false);
    }
  }, [focusCreateTitle, activeStep]);

  function onDeckSelect(value: string) {
    if (value === CREATE_NEW_DECK) {
      setActiveStep(0);
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

  const [tab, setTab] = useState<"paste" | "file">("paste");

  async function onCreateDeck(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const deck = await createDeck(title);
      setDecks((prev) => [...prev, deck]);
      setSelectedDeckId(deck.id);
      setTitle("");
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
    const pairs = guestPasteToCards(pasteText);
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
      setNotice(`Added ${added.length} local cards to “${deckTitle}”`);
      setActiveStep(2);
      await onChanged?.();
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
      const material = await pasteMaterial(selectedDeckId, {
        text: pasteText,
        ...(filename.trim() ? { filename: filename.trim() } : {}),
      });
      setPasteText("");
      setFilename("");
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
    if (figureFiles.length > 20) {
      setError("Attach at most 20 figure crops");
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
      const material =
        contentType === "application/pdf" && figureFiles.length > 0
          ? await uploadPdfWithFigureCrops(
              selectedDeckId,
              uploadFile,
              figureFiles,
            )
          : await uploadMaterialFile(selectedDeckId, uploadFile);
      setUploadFile(null);
      setFigureFiles([]);
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
    }
  }

  const steps = ["Deck", "Material", "Done"] as const;

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
                <Divider>or create new</Divider>
              </Stack>
            ) : null}
            <Box component="form" onSubmit={onCreateDeck} noValidate>
              <Stack spacing={2}>
                <Typography variant="h6">
                  {decks.length > 0 ? "New deck" : "Create a deck"}
                </Typography>
                <TextField
                  label="Title"
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
                  disabled={busy || !title.trim()}
                >
                  {busy ? "Working…" : "Create deck"}
                </Button>
              </Stack>
            </Box>
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
                    <Button
                      variant="outlined"
                      component="label"
                      disabled={busy || !selectedDeckId}
                    >
                      {figureFiles.length > 0
                        ? `${figureFiles.length} figure crop${figureFiles.length === 1 ? "" : "s"} selected`
                        : "Attach figure crops (PNG)"}
                      <input
                        type="file"
                        accept="image/png,.png"
                        multiple
                        hidden
                        onChange={(ev) => {
                          setFigureFiles(Array.from(ev.target.files ?? []));
                        }}
                      />
                    </Button>
                  ) : null}
                  <Typography variant="caption" color="text.secondary">
                    PDF/PPTX max 25MB; images max 8MB. Upload starts generation
                    when complete.
                  </Typography>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={busy || !selectedDeckId || !uploadFile}
                  >
                    {busy ? "Uploading…" : "Upload file"}
                  </Button>
                </Stack>
              </Box>
            )}
          </Box>
        )}

        {activeStep === 2 && (
          <Box>
            <Typography variant="body1" gutterBottom>
              {jobId ? (
                <>
                  Generation started.{" "}
                  <a href={`/jobs/${encodeURIComponent(jobId)}/drafts`}>
                    View drafts
                  </a>
                </>
              ) : localOnly ? (
                <>
                  Done. Cards are ready on{" "}
                  <a href="/today">Today</a> or <a href="/study">Study</a>.
                </>
              ) : (
                "Done. Add more material or go to drafts when ready."
              )}
            </Typography>
            <Stack direction="row" spacing={2}>
              <Button variant="outlined" onClick={() => setActiveStep(0)}>
                Add more
              </Button>
            </Stack>
          </Box>
        )}
      </Box>
    </Box>
  );
}

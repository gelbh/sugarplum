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
  uploadPdf,
  type Deck,
  ApiError,
} from "../api/client";
import { stepperSx } from "./stepperSx";

type Props = {
  decks: Deck[];
  setDecks: (updater: (prev: Deck[]) => Deck[]) => void;
  activeStep: number;
  setActiveStep: (n: number) => void;
  onChanged?: () => void | Promise<void>;
};

const MAX_PDF_BYTES = 25 * 1024 * 1024;
const CREATE_NEW_DECK = "__create_new_deck__";

export default function CreateMaterialStepper({
  decks,
  setDecks,
  activeStep,
  setActiveStep,
  onChanged,
}: Props) {
  const [title, setTitle] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [filename, setFilename] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);

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

  // material tab: paste or pdf
  const [tab, setTab] = useState<"paste" | "pdf">("paste");

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

  async function onPaste(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
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
        // preserve existing behavior: navigate to drafts
        window.location.assign(`/jobs/${encodeURIComponent(material.jobId)}/drafts`);
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

  async function onUploadPdf(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    if (!selectedDeckId) {
      setError("Select a deck first");
      return;
    }
    if (!pdfFile) {
      setError("Choose a PDF file");
      return;
    }
    if (pdfFile.type && pdfFile.type !== "application/pdf") {
      setError("Only PDF files are allowed");
      return;
    }
    if (pdfFile.size > MAX_PDF_BYTES) {
      setError("PDF must be 25MB or smaller");
      return;
    }
    setBusy(true);
    try {
      const material = await uploadPdf(selectedDeckId, pdfFile);
      setPdfFile(null);
      if (material.jobId) {
        setJobId(material.jobId);
        setNotice(
          `Stored PDF (${material.status}). Generation started.`,
        );
        setActiveStep(2);
      } else {
        setNotice(
          `Stored PDF (${material.status}). Text extraction is not ready yet; use paste for generation.`,
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload PDF");
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
                  <InputLabel id="existing-deck-label">Existing deck</InputLabel>
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

        {activeStep === 1 && (
          <Box>
            <Tabs
              value={tab}
              onChange={(_ev, v) => setTab(v)}
              aria-label="material-type-tabs"
              sx={{ mb: 2 }}
            >
              <Tab value="paste" label="Paste" />
              <Tab value="pdf" label="PDF" />
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

            {tab === "pdf" && (
              <Box component="form" onSubmit={onUploadPdf} noValidate>
                <Stack spacing={2}>
                  {deckSelect("pdf-deck-select-label")}
                  <Button
                    variant="outlined"
                    component="label"
                    disabled={busy || !selectedDeckId}
                  >
                    {pdfFile ? pdfFile.name : "Choose PDF"}
                    <input
                      type="file"
                      accept="application/pdf,.pdf"
                      hidden
                      onChange={(ev) => {
                        const file = ev.target.files?.[0] ?? null;
                        setPdfFile(file);
                      }}
                    />
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    PDF only, max 25MB. Stored for later; flashcard generation from PDF
                    text is not available yet (use paste).
                  </Typography>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={busy || !selectedDeckId || !pdfFile}
                  >
                    {busy ? "Uploading…" : "Upload PDF"}
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
                  <a href={`/jobs/${encodeURIComponent(jobId)}/drafts`}>View drafts</a>
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


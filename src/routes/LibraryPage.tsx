import { useEffect, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  createDeck,
  listDecks,
  me,
  pasteMaterial,
  uploadPdf,
  type Deck,
} from "../api/client";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

export default function LibraryPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [title, setTitle] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [filename, setFilename] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const list = await listDecks();
        if (cancelled) return;
        setDecks(list);
        if (list[0]) setSelectedDeckId(list[0].id);
        setReady(true);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load library");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreateDeck(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const deck = await createDeck(title);
      setDecks((prev) => [...prev, deck]);
      setSelectedDeckId(deck.id);
      setTitle("");
      setNotice(`Created “${deck.title}”`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create deck");
    } finally {
      setBusy(false);
    }
  }

  async function onPaste(e: FormEvent) {
    e.preventDefault();
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
        window.location.assign(`/jobs/${encodeURIComponent(material.jobId)}/drafts`);
        return;
      }
      setNotice(`Saved paste material (${material.status})`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save paste");
    } finally {
      setBusy(false);
    }
  }

  async function onUploadPdf(e: FormEvent) {
    e.preventDefault();
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
      // PDF text extract is not implemented yet; store only (do not claim cards ready).
      setNotice(
        `Stored PDF (${material.status}). Text extraction is not ready yet — use paste for generation.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not upload PDF");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading library…</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: 6 }}>
      <Typography variant="h4" component="h1" gutterBottom color="primary">
        Library
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Create decks, paste notes, or upload PDFs as materials.
      </Typography>

      <Stack spacing={4}>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {notice ? <Alert severity="success">{notice}</Alert> : null}

        <Box>
          <Typography variant="h6" component="h2" gutterBottom>
            Your decks
          </Typography>
          {decks.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No decks yet. Create one below.
            </Typography>
          ) : (
            <Stack component="ul" spacing={0.5} sx={{ m: 0, pl: 2 }}>
              {decks.map((d) => (
                <Typography component="li" key={d.id} variant="body2">
                  {d.title}
                </Typography>
              ))}
            </Stack>
          )}
        </Box>

        <Box component="form" onSubmit={onCreateDeck} noValidate>
          <Stack spacing={2}>
            <Typography variant="h6" component="h2">
              New deck
            </Typography>
            <TextField
              label="Title"
              name="title"
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              required
              fullWidth
            />
            <Button type="submit" variant="contained" disabled={busy || !title.trim()}>
              {busy ? "Working…" : "Create deck"}
            </Button>
          </Stack>
        </Box>

        <Box component="form" onSubmit={onPaste} noValidate>
          <Stack spacing={2}>
            <Typography variant="h6" component="h2">
              Paste material
            </Typography>
            <FormControl fullWidth disabled={decks.length === 0}>
              <InputLabel id="deck-select-label">Deck</InputLabel>
              <Select
                labelId="deck-select-label"
                label="Deck"
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
              disabled={busy || decks.length === 0 || !pasteText.trim()}
            >
              {busy ? "Saving…" : "Save paste"}
            </Button>
          </Stack>
        </Box>

        <Box component="form" onSubmit={onUploadPdf} noValidate>
          <Stack spacing={2}>
            <Typography variant="h6" component="h2">
              Upload PDF
            </Typography>
            <FormControl fullWidth disabled={decks.length === 0}>
              <InputLabel id="pdf-deck-select-label">Deck</InputLabel>
              <Select
                labelId="pdf-deck-select-label"
                label="Deck"
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
              variant="outlined"
              component="label"
              disabled={busy || decks.length === 0}
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
              disabled={busy || decks.length === 0 || !pdfFile}
            >
              {busy ? "Uploading…" : "Upload PDF"}
            </Button>
          </Stack>
        </Box>

        <Typography variant="body2">
          <Link href="/" underline="hover">
            Back home
          </Link>
        </Typography>
      </Stack>
    </Container>
  );
}

import { useEffect, useId, useState, type FormEvent } from "react";
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
  PPTX_MIME,
  resolveUploadContentType,
  uploadMaterialFile,
  type Deck,
} from "../api/client";
import { useProgressRegistry } from "../progress/ProgressProvider";
import { useTrackedBusy } from "../progress/useTrackedBusy";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_UPLOAD_MIMES = new Set([
  "application/pdf",
  PPTX_MIME,
  ...IMAGE_MIMES,
]);

export default function LibraryPage() {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [title, setTitle] = useState("");
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [filename, setFilename] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { end: endLoad } = useTrackedBusy("Loading library…", {
    trackOnMount: true,
  });
  const { busy, begin, end } = useTrackedBusy("Working…");
  const { upsert, complete, fail } = useProgressRegistry();
  const uploadOpId = `upload:${useId()}`;
  const anyBusy = busy || uploading;

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
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Failed to load library");
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

  async function onCreateDeck(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    begin("Working…");
    try {
      const deck = await createDeck(title);
      setDecks((prev) => [...prev, deck]);
      setSelectedDeckId(deck.id);
      setTitle("");
      setNotice(`Created “${deck.title}”`);
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create deck");
      end(false);
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
    begin("Saving…");
    try {
      const material = await pasteMaterial(selectedDeckId, {
        text: pasteText,
        ...(filename.trim() ? { filename: filename.trim() } : {}),
      });
      setPasteText("");
      setFilename("");
      if (material.jobId) {
        end();
        window.location.assign(`/jobs/${encodeURIComponent(material.jobId)}/drafts`);
        return;
      }
      setNotice(`Saved paste material (${material.status})`);
      end();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save paste");
      end(false);
    }
  }

  async function onUploadFile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
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
    setUploading(true);
    upsert({
      id: uploadOpId,
      label: "Uploading file",
      mode: "determinate",
      percent: 0,
      source: "client",
    });
    try {
      const material = await uploadMaterialFile(
        selectedDeckId,
        uploadFile,
        (percent) => {
          upsert({
            id: uploadOpId,
            label: "Uploading file",
            mode: "determinate",
            percent,
            source: "client",
          });
        },
      );
      complete(uploadOpId);
      setUploadFile(null);
      if (material.jobId) {
        window.location.assign(
          `/jobs/${encodeURIComponent(material.jobId)}/drafts`,
        );
        return;
      }
      setNotice(
        `File already stored (${material.status}). Open drafts from a prior generate, or upload a new file.`,
      );
    } catch (err) {
      fail(uploadOpId);
      setError(err instanceof ApiError ? err.message : "Could not upload file");
    } finally {
      setUploading(false);
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
        Create decks, paste notes, or upload PDF, PPTX, or image materials.
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
            <Button
              type="submit"
              variant="contained"
              disabled={anyBusy || !title.trim()}
            >
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
              disabled={anyBusy || decks.length === 0 || !pasteText.trim()}
            >
              {busy ? "Saving…" : "Save paste"}
            </Button>
          </Stack>
        </Box>

        <Box component="form" onSubmit={onUploadFile} noValidate>
          <Stack spacing={2}>
            <Typography variant="h6" component="h2">
              Upload file
            </Typography>
            <FormControl fullWidth disabled={decks.length === 0}>
              <InputLabel id="file-deck-select-label">Deck</InputLabel>
              <Select
                labelId="file-deck-select-label"
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
              disabled={anyBusy || decks.length === 0}
            >
              {uploadFile ? uploadFile.name : "Choose PDF, PPTX, or image"}
              <input
                type="file"
                accept="application/pdf,.pdf,.pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation,image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                hidden
                onChange={(ev) => {
                  const file = ev.target.files?.[0] ?? null;
                  setUploadFile(file);
                }}
              />
            </Button>
            <Typography variant="caption" color="text.secondary">
              PDF/PPTX max 25MB; images max 8MB. Upload starts
              generation when complete.
            </Typography>
            <Button
              type="submit"
              variant="contained"
              disabled={anyBusy || decks.length === 0 || !uploadFile}
            >
              {uploading ? "Uploading…" : "Upload file"}
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

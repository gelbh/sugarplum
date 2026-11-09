import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  createDeck,
  createSubject,
  listDecks,
  listSubjects,
  type Deck,
  type Subject,
} from "../api/client";
import { makeAtlasCards } from "./apiSource";
import { readLastDeckId, writeLastDeckId } from "./lastDeckStorage";

const NEW_DECK = "__new__";

type Props = {
  open: boolean;
  atlasId: string;
  entryKeys: string[];
  title?: string;
  onClose: () => void;
  onQueued: (jobId: string, jobCount: number) => void;
};

export default function MakeCardsDeckDialog({
  open,
  atlasId,
  entryKeys,
  title = "Make cards",
  onClose,
  onQueued,
}: Props) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [deckId, setDeckId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [deckList, subjectList] = await Promise.all([
          listDecks(),
          listSubjects(),
        ]);
        if (cancelled) return;
        setDecks(deckList);
        setSubjects(subjectList);
        const last = readLastDeckId(atlasId);
        const preferred =
          (last && deckList.some((d) => d.id === last) && last) ||
          deckList[0]?.id ||
          NEW_DECK;
        setDeckId(preferred);
        if (!deckList.length) {
          setNewTitle("Atlas cards");
        }
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Could not load decks",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, atlasId]);

  async function resolveDeckId(): Promise<string> {
    if (deckId !== NEW_DECK) return deckId;
    const titleText = newTitle.trim() || "Atlas cards";
    let subjectId = subjects[0]?.id;
    if (!subjectId) {
      const subject = await createSubject("Unfiled");
      subjectId = subject.id;
      setSubjects((prev) => [...prev, subject]);
    }
    const deck = await createDeck(titleText, subjectId);
    setDecks((prev) => [...prev, deck]);
    return deck.id;
  }

  async function onSubmit() {
    if (entryKeys.length === 0) {
      setError("No entries selected");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resolvedDeckId = await resolveDeckId();
      const result = await makeAtlasCards(atlasId, {
        deckId: resolvedDeckId,
        entryKeys,
      });
      writeLastDeckId(atlasId, resolvedDeckId);
      const jobId = result.jobId ?? result.jobs[0]?.jobId;
      if (!jobId) throw new Error("No generation job created");
      onQueued(jobId, result.jobs.length || 1);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not queue Make cards",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack gap={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {entryKeys.length === 1
              ? "Pick a deck for drafts from this Atlas entry."
              : `Pick a deck for drafts from ${entryKeys.length} Atlas entries.`}
          </Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <FormControl fullWidth disabled={loading || busy}>
            <InputLabel id="atlas-make-cards-deck-label">Deck</InputLabel>
            <Select
              labelId="atlas-make-cards-deck-label"
              label="Deck"
              value={deckId || NEW_DECK}
              onChange={(ev) => setDeckId(String(ev.target.value))}
            >
              {decks.map((deck) => (
                <MenuItem key={deck.id} value={deck.id}>
                  {deck.title}
                </MenuItem>
              ))}
              <MenuItem value={NEW_DECK}>New deck…</MenuItem>
            </Select>
          </FormControl>
          {deckId === NEW_DECK ? (
            <TextField
              label="New deck title"
              value={newTitle}
              onChange={(ev) => setNewTitle(ev.target.value)}
              disabled={busy}
              fullWidth
            />
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void onSubmit()}
          disabled={busy || loading || entryKeys.length === 0}
        >
          {busy ? "Queuing…" : "Make cards"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

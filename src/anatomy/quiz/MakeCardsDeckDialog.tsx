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
  createDeckCard,
  createSubject,
  listDecks,
  listSubjects,
  type Deck,
  type Subject,
} from "../../api/client";
import {
  readLastDeckId,
  writeLastDeckId,
} from "../../atlas/hub/lastDeckStorage";
import { structureToQaFields } from "../structure/structureCard";
import type { AnatomyStructure } from "../types";

const NEW_DECK = "__new__";

type Props = {
  open: boolean;
  sceneId: string;
  sceneTitle: string;
  structures: AnatomyStructure[];
  onClose: () => void;
  onCreated: (count: number, deckId: string) => void;
};

export default function MakeCardsDeckDialog({
  open,
  sceneId,
  sceneTitle,
  structures,
  onClose,
  onCreated,
}: Props) {
  const storageKey = `anatomy:${sceneId}`;
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
        const last = readLastDeckId(storageKey);
        const preferred =
          (last && deckList.some((d) => d.id === last) && last) ||
          deckList[0]?.id ||
          NEW_DECK;
        setDeckId(preferred);
        if (!deckList.length) {
          setNewTitle(`${sceneTitle} anatomy`);
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
  }, [open, storageKey, sceneTitle]);

  async function resolveDeckId(): Promise<string> {
    if (deckId !== NEW_DECK) return deckId;
    const titleText = newTitle.trim() || `${sceneTitle} anatomy`;
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
    if (structures.length === 0) {
      setError("No structures selected");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resolvedDeckId = await resolveDeckId();
      let created = 0;
      for (const structure of structures) {
        const { front, back } = structureToQaFields(structure, sceneTitle);
        if (!front) continue;
        await createDeckCard(resolvedDeckId, { type: "qa", front, back });
        created += 1;
      }
      if (created === 0) throw new Error("No cards created");
      writeLastDeckId(storageKey, resolvedDeckId);
      onCreated(created, resolvedDeckId);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create cards",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>Make cards</DialogTitle>
      <DialogContent>
        <Stack
          sx={{
            gap: 2,
            pt: 0.5
          }}>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {structures.length === 1
              ? `Create a Study card for ${structures[0]?.label ?? "this structure"}.`
              : `Create Study cards for ${structures.length} structures.`}
          </Typography>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <FormControl fullWidth disabled={loading || busy}>
            <InputLabel id="anatomy-make-cards-deck-label">Deck</InputLabel>
            <Select
              labelId="anatomy-make-cards-deck-label"
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
          disabled={busy || loading || structures.length === 0}
        >
          {busy ? "Creating…" : "Make cards"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

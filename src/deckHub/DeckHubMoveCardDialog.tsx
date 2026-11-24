import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import type { Deck, Subject } from "../api/client";

type Props = {
  open: boolean;
  batch: boolean;
  selectedCount: number;
  error: string | null;
  busy: boolean;
  subjects: Subject[];
  decks: Deck[];
  deckChoices: Deck[];
  subjectId: string;
  deckId: string;
  onSubjectChange: (subjectId: string) => void;
  onDeckChange: (deckId: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeckHubMoveCardDialog({
  open,
  batch,
  selectedCount,
  error,
  busy,
  subjects,
  decks,
  deckChoices,
  subjectId,
  deckId,
  onSubjectChange,
  onDeckChange,
  onClose,
  onConfirm,
}: Props) {
  const multi = batch && selectedCount > 1;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        {multi ? `Move ${selectedCount} cards` : "Move card"}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          {multi
            ? "Choose a subject and deck. Selected cards leave this deck; study schedules stay the same."
            : "Choose a subject and deck. The card leaves this deck; its study schedule stays the same."}
        </DialogContentText>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ pt: 1 }}>
          <FormControl fullWidth disabled={busy || subjects.length === 0}>
            <InputLabel id="move-subject-label">Subject</InputLabel>
            <Select
              labelId="move-subject-label"
              label="Subject"
              value={subjectId}
              onChange={(ev) => onSubjectChange(ev.target.value)}
            >
              {subjects.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={busy || deckChoices.length === 0}>
            <InputLabel id="move-deck-label">Deck</InputLabel>
            <Select
              labelId="move-deck-label"
              label="Deck"
              value={deckId}
              onChange={(ev) => onDeckChange(ev.target.value)}
              displayEmpty
              renderValue={(value) => {
                if (!value) {
                  return deckChoices.length === 0
                    ? "No other decks in this subject"
                    : "Choose a deck";
                }
                return (
                  decks.find((d) => d.id === value)?.title ?? "Choose a deck"
                );
              }}
            >
              {deckChoices.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={busy || !deckId}
          onClick={onConfirm}
        >
          {busy ? "Moving…" : "Move"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

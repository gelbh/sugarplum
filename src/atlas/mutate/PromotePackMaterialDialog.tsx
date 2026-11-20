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
import Typography from "@mui/material/Typography";
import { ApiError, listDecks, type Deck } from "../../api/client";
import { promoteAtlasMaterial } from "../hub/apiMaterials";
import { readLastDeckId, writeLastDeckId } from "../hub/lastDeckStorage";

type Props = {
  open: boolean;
  atlasId: string;
  materialId: string | null;
  materialLabel: string;
  onClose: () => void;
  onPromoted: () => void;
};

export default function PromotePackMaterialDialog({
  open,
  atlasId,
  materialId,
  materialLabel,
  onClose,
  onPromoted,
}: Props) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [deckId, setDeckId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const deckList = await listDecks();
        if (cancelled) return;
        setDecks(deckList);
        const last = readLastDeckId(atlasId);
        const preferred =
          (last && deckList.some((d) => d.id === last) && last) ||
          deckList[0]?.id ||
          "";
        setDeckId(preferred);
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

  async function onPromote() {
    if (!materialId || !deckId) return;
    setBusy(true);
    setError(null);
    try {
      await promoteAtlasMaterial(materialId, deckId);
      writeLastDeckId(atlasId, deckId);
      onPromoted();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle>Copy to deck</DialogTitle>
      <DialogContent>
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 1.5
          }}>
          Copies “{materialLabel}” into a deck for card generation later. The
          course pack file stays; no cards are created until you generate in
          Materials.
        </Typography>
        {error ? (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        ) : null}
        <FormControl fullWidth size="small" disabled={busy || loading}>
          <InputLabel id="promote-deck-label">Deck</InputLabel>
          <Select
            labelId="promote-deck-label"
            label="Deck"
            value={deckId}
            onChange={(ev) => setDeckId(ev.target.value)}
          >
            {decks.map((d) => (
              <MenuItem key={d.id} value={d.id}>
                {d.title}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {!loading && decks.length === 0 ? (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 1
            }}>
            Create a deck first, then promote.
          </Typography>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void onPromote()}
          disabled={busy || loading || !deckId || !materialId}
        >
          Copy to deck
        </Button>
      </DialogActions>
    </Dialog>
  );
}

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { deleteEntryNote, putEntryNote } from "./apiSource";
import type { AtlasEntryView } from "./types";

/** Keep in sync with worker/atlas/notes.ts NOTE_MAX_CHARS. */
const NOTE_MAX_CHARS = 8000;

type Props = {
  atlasId: string;
  entryId: string;
  personalNote: string | null;
  onUpdated: (entry: AtlasEntryView) => void;
};

export default function EntryPersonalNotes({
  atlasId,
  entryId,
  personalNote,
  onUpdated,
}: Props) {
  const [draft, setDraft] = useState(personalNote ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(personalNote ?? "");
    setError(null);
  }, [entryId, personalNote]);

  const server = personalNote ?? "";
  const dirty = draft !== server;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const trimmed = draft.trim();
      const next =
        trimmed.length === 0
          ? await deleteEntryNote(atlasId, entryId)
          : await putEntryNote(atlasId, entryId, draft);
      onUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save note");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const next = await deleteEntryNote(atlasId, entryId);
      onUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not clear note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box component="section" aria-label="My notes">
      <Typography
        sx={{
          color: "text.secondary",
          fontSize: "0.78rem",
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          mb: 1,
        }}
      >
        My notes
      </Typography>
      <TextField
        value={draft}
        onChange={(ev) => setDraft(ev.target.value)}
        multiline
        minRows={3}
        fullWidth
        size="small"
        placeholder="Private study notes for this parasite"
        disabled={busy}
        slotProps={{ htmlInput: { maxLength: NOTE_MAX_CHARS } }}
      />
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          size="small"
          onClick={() => void save()}
          disabled={busy || !dirty}
        >
          Save
        </Button>
        <Button
          variant="text"
          size="small"
          onClick={() => void clear()}
          disabled={busy || (!server && !draft.trim())}
        >
          Clear
        </Button>
      </Stack>
      {error ? (
        <Typography color="error" sx={{ mt: 1, fontSize: "0.85rem" }}>
          {error}
        </Typography>
      ) : null}
    </Box>
  );
}

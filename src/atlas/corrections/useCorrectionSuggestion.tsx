import { useEffect, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import type { AtlasEntryView, EntryPatch } from "../types";
import { postEntrySuggestion, type SuggestionBody } from "./apiCorrections";
import {
  SUGGESTION_FAILED_COPY,
  SUGGESTION_NOTE_MAX,
  isSuggestionSourceUrl,
} from "./correctionCopy";

type Args = {
  atlasId: string;
  entry: AtlasEntryView | null;
  onSent: () => void;
};

type Pending = { entryId: string; body: SuggestionBody };

export function useCorrectionSuggestion({ atlasId, entry, onSent }: Args) {
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [failed, setFailed] = useState<Pending | null>(null);
  const [retrying, setRetrying] = useState(false);
  const entryId = entry?.id ?? null;

  useEffect(() => {
    setChecked(false);
    setNote("");
    setSourceUrl("");
  }, [entryId]);

  async function send(pending: Pending): Promise<void> {
    try {
      await postEntrySuggestion(atlasId, pending.entryId, pending.body);
      setFailed(null);
      onSent();
    } catch {
      // The overlay PATCH already landed; never roll it back, just offer retry.
      setFailed(pending);
    }
  }

  async function afterSave(patch: EntryPatch): Promise<void> {
    if (!entry?.originKey || !checked) return;
    await send({
      entryId: entry.id,
      body: {
        patch,
        note: note.trim() || null,
        sourceUrl: sourceUrl.trim() || null,
      },
    });
  }

  async function retry() {
    if (!failed) return;
    setRetrying(true);
    await send(failed);
    setRetrying(false);
  }

  const urlInvalid = !isSuggestionSourceUrl(sourceUrl);

  const footerExtra: ReactNode = entry?.originKey ? (
    <Stack spacing={1} sx={{ pt: 1 }}>
      <FormControlLabel
        control={
          <Checkbox
            checked={checked}
            onChange={(ev) => setChecked(ev.target.checked)}
          />
        }
        label="Suggest this correction for everyone"
      />
      {checked ? (
        <>
          <TextField
            label="Note (optional)"
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            multiline
            minRows={2}
            fullWidth
            slotProps={{ htmlInput: { maxLength: SUGGESTION_NOTE_MAX } }}
            helperText={`${note.length}/${SUGGESTION_NOTE_MAX}`}
          />
          <TextField
            label="Source link (optional)"
            type="url"
            value={sourceUrl}
            onChange={(ev) => setSourceUrl(ev.target.value)}
            fullWidth
            error={urlInvalid}
            helperText={
              urlInvalid
                ? "Use an http or https link"
                : "Where the corrected fact comes from"
            }
          />
        </>
      ) : null}
    </Stack>
  ) : null;

  const toast: ReactNode = (
    <Snackbar
      open={failed !== null}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        severity="warning"
        variant="filled"
        action={
          <>
            <Button
              color="inherit"
              size="small"
              disabled={retrying}
              onClick={() => void retry()}
            >
              Retry
            </Button>
            <Button
              color="inherit"
              size="small"
              onClick={() => setFailed(null)}
            >
              Dismiss
            </Button>
          </>
        }
      >
        {SUGGESTION_FAILED_COPY}
      </Alert>
    </Snackbar>
  );

  return { footerExtra, afterSave, toast };
}

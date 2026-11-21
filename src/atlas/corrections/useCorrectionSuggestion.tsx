import { useEffect, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { ApiError } from "../../api/client";
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

/** A request the server rejected as invalid carries its reason, not a Retry. */
type Failure = Pending & { reason: string | null };

function rejectionReason(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  if (err.status < 400 || err.status >= 500 || err.status === 429) return null;
  return err.message;
}

export function useCorrectionSuggestion({ atlasId, entry, onSent }: Args) {
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [failed, setFailed] = useState<Failure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const entryId = entry?.id ?? null;
  const urlInvalid = !isSuggestionSourceUrl(sourceUrl);

  useEffect(() => {
    setChecked(false);
    setNote("");
    setSourceUrl("");
  }, [entryId]);

  async function send(pending: Pending): Promise<void> {
    try {
      await postEntrySuggestion(atlasId, pending.entryId, pending.body);
      setFailed((f) => (f?.entryId === pending.entryId ? null : f));
      onSent();
    } catch (err) {
      // The overlay PATCH already landed; never roll it back.
      setFailed({ ...pending, reason: rejectionReason(err) });
    }
  }

  async function afterSave(patch: EntryPatch): Promise<void> {
    if (!entry?.originKey || !checked || urlInvalid) return;
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
    await send({ entryId: failed.entryId, body: failed.body });
    setRetrying(false);
  }

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
            {failed?.reason ? null : (
              <Button
                color="inherit"
                size="small"
                disabled={retrying}
                onClick={() => void retry()}
              >
                Retry
              </Button>
            )}
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
        {failed?.reason ? (
          <Box component="span" sx={{ display: "block" }}>
            {failed.reason}
          </Box>
        ) : null}
      </Alert>
    </Snackbar>
  );

  const saveBlocked = checked && urlInvalid;

  return { footerExtra, afterSave, toast, saveBlocked };
}

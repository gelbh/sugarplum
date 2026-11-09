import { useEffect, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ApiError } from "../api/client";
import {
  createEntry,
  listDeletedEntries,
  patchEntry,
  purgeDeletedEntry,
  resetEntry,
  restoreEntry,
  softDeleteEntry,
} from "./apiSource";
import type { AtlasEntryView } from "./types";

type Busy = boolean;

function errMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

type AddProps = {
  open: boolean;
  subjectId: string;
  onClose: () => void;
  onDone: (entry: AtlasEntryView) => void;
};

export function AddEntryDialog({ open, subjectId, onClose, onDone }: AddProps) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<Busy>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setError(null);
    setBusy(false);
  }, [open]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const canonicalName = name.trim();
    if (!canonicalName) {
      setError("Canonical name required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const entry = await createEntry(subjectId, { canonicalName });
      onDone(entry);
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not add entry"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <form onSubmit={onSubmit}>
        <DialogTitle>Add entry</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              autoFocus
              label="Canonical name"
              value={name}
              onChange={(ev) => setName(ev.target.value)}
              disabled={busy}
              fullWidth
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

type EditProps = {
  open: boolean;
  subjectId: string;
  entry: AtlasEntryView | null;
  onClose: () => void;
  onDone: () => void;
};

export function EditEntryDialog({
  open,
  subjectId,
  entry,
  onClose,
  onDone,
}: EditProps) {
  const [commonName, setCommonName] = useState("");
  const [busy, setBusy] = useState<Busy>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entry) return;
    setCommonName(entry.commonName ?? "");
    setError(null);
    setBusy(false);
  }, [open, entry]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await patchEntry(subjectId, entry.id, {
        commonName: commonName.trim() || null,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not save entry"));
    } finally {
      setBusy(false);
    }
  }

  async function onSoftDelete() {
    if (!entry) return;
    if (!window.confirm(`Soft-delete ${entry.canonicalName}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await softDeleteEntry(subjectId, entry.id);
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not delete entry"));
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!entry?.originKey) return;
    if (!window.confirm(`Reset ${entry.canonicalName} to the dataset?`)) return;
    setBusy(true);
    setError(null);
    try {
      await resetEntry(subjectId, entry.id);
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not reset entry"));
    } finally {
      setBusy(false);
    }
  }

  const canReset = Boolean(entry?.originKey && entry?.editedAt);

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <form onSubmit={onSubmit}>
        <DialogTitle>
          Edit {entry ? <em>{entry.canonicalName}</em> : "entry"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              autoFocus
              label="Common name"
              value={commonName}
              onChange={(ev) => setCommonName(ev.target.value)}
              disabled={busy}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
          <Stack direction="row" gap={1}>
            <Button color="error" onClick={() => void onSoftDelete()} disabled={busy}>
              Delete
            </Button>
            {canReset ? (
              <Button onClick={() => void onReset()} disabled={busy}>
                Reset to original
              </Button>
            ) : null}
          </Stack>
          <Stack direction="row" gap={1}>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </Stack>
        </DialogActions>
      </form>
    </Dialog>
  );
}

type DeletedProps = {
  open: boolean;
  subjectId: string;
  onClose: () => void;
  onChanged: () => void;
};

export function RecentlyDeletedDialog({
  open,
  subjectId,
  onClose,
  onChanged,
}: DeletedProps) {
  const [entries, setEntries] = useState<AtlasEntryView[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries(null);
    setError(null);
    (async () => {
      try {
        const list = await listDeletedEntries(subjectId);
        if (!cancelled) setEntries(list);
      } catch (err) {
        if (!cancelled) {
          setError(errMessage(err, "Could not load deleted entries"));
          setEntries([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, subjectId]);

  async function onRestore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await restoreEntry(subjectId, id);
      setEntries((prev) => (prev ?? []).filter((e) => e.id !== id));
      onChanged();
    } catch (err) {
      setError(errMessage(err, "Could not restore entry"));
    } finally {
      setBusyId(null);
    }
  }

  async function onPurge(entry: AtlasEntryView) {
    if (!window.confirm(`Permanently delete ${entry.canonicalName}?`)) return;
    setBusyId(entry.id);
    setError(null);
    try {
      await purgeDeletedEntry(subjectId, entry.id);
      setEntries((prev) => (prev ?? []).filter((e) => e.id !== entry.id));
      onChanged();
    } catch (err) {
      setError(errMessage(err, "Could not permanently delete entry"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Recently deleted</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {entries === null ? (
            <Typography color="text.secondary">Loading…</Typography>
          ) : entries.length === 0 ? (
            <Typography color="text.secondary">No deleted entries.</Typography>
          ) : (
            entries.map((e) => (
              <Stack
                key={e.id}
                direction={{ xs: "column", sm: "row" }}
                alignItems={{ sm: "center" }}
                justifyContent="space-between"
                gap={1}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 1.5,
                  py: 1,
                }}
              >
                <Typography sx={{ fontStyle: "italic", fontWeight: 600 }}>
                  {e.canonicalName}
                </Typography>
                <Stack direction="row" gap={1}>
                  <Button
                    size="small"
                    disabled={busyId === e.id}
                    onClick={() => void onRestore(e.id)}
                  >
                    Restore
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    disabled={busyId === e.id}
                    onClick={() => void onPurge(e)}
                  >
                    Delete permanently
                  </Button>
                </Stack>
              </Stack>
            ))
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

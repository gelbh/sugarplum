import { useEffect, useMemo, useState, type FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ZodError } from "zod";
import { ApiError } from "../api/client";
import {
  diagnosticMirrorForSave,
  diagnosticOwnershipIssue,
  diagnosticStageFromStages,
  hydrateLifecycleDraft,
} from "../../worker/atlas/lifecycleDiagnostic";
import LifecycleSwimlane from "./LifecycleSwimlane";
import {
  PARASITE_GROUPS,
  lifecycleStageSchema,
} from "../../worker/atlas/templates/parasite";
import {
  createEntry,
  listDeletedEntries,
  patchEntry,
  purgeDeletedEntry,
  resetEntry,
  restoreEntry,
  softDeleteEntry,
} from "./apiSource";
import { GROUP_LABELS } from "./filter";
import StageListEditor, { type StageDraft } from "./StageListEditor";
import type { AtlasEntryView, DatasetFields, ParasiteGroup } from "./types";

/** Preview accepts free-text hosts the same way learner overlays do. */
function previewLifecycleFields(
  base: DatasetFields,
  stages: StageDraft[],
): DatasetFields {
  return {
    ...base,
    lifecycleStages: stages as DatasetFields["lifecycleStages"],
    diagnosticStage: diagnosticStageFromStages(stages),
  };
}

type Busy = boolean;

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof ZodError) {
    return err.issues.map((i) => i.message).join("; ") || fallback;
  }
  return fallback;
}

function parseHostList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

type AddProps = {
  open: boolean;
  atlasId: string;
  onClose: () => void;
  onDone: (entry: AtlasEntryView) => void;
};

export function AddEntryDialog({ open, atlasId, onClose, onDone }: AddProps) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState<ParasiteGroup | "">("");
  const [busy, setBusy] = useState<Busy>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setGroup("");
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
    if (!group) {
      setError("Group required");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const entry = await createEntry(atlasId, {
        canonicalName,
        fields: { group },
      });
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
            <TextField
              select
              label="Group"
              value={group}
              onChange={(ev) =>
                setGroup(ev.target.value as ParasiteGroup | "")
              }
              disabled={busy}
              fullWidth
              required
            >
              {PARASITE_GROUPS.map((g) => (
                <MenuItem key={g} value={g}>
                  {GROUP_LABELS[g].plural}
                </MenuItem>
              ))}
            </TextField>
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
  atlasId: string;
  entry: AtlasEntryView | null;
  onClose: () => void;
  onDone: () => void;
};

export function EditEntryDialog({
  open,
  atlasId,
  entry,
  onClose,
  onDone,
}: EditProps) {
  const [commonName, setCommonName] = useState("");
  const [definitiveHosts, setDefinitiveHosts] = useState("");
  const [busy, setBusy] = useState<Busy>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entry) return;
    setCommonName(entry.commonName ?? "");
    setDefinitiveHosts((entry.fields.definitiveHosts ?? []).join(", "));
    setError(null);
    setBusy(false);
  }, [open, entry]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      await patchEntry(atlasId, entry.id, {
        commonName: commonName.trim() || null,
        // Learner edits accept free-text hosts; DatasetFields vocab is dataset-only.
        fields: {
          definitiveHosts: parseHostList(
            definitiveHosts,
          ) as AtlasEntryView["fields"]["definitiveHosts"],
        },
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
      await softDeleteEntry(atlasId, entry.id);
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
      await resetEntry(atlasId, entry.id);
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
            <TextField
              label="Definitive hosts"
              value={definitiveHosts}
              onChange={(ev) => setDefinitiveHosts(ev.target.value)}
              disabled={busy}
              fullWidth
              helperText="Comma-separated host terms"
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

type LifecycleEditProps = {
  open: boolean;
  atlasId: string;
  entry: AtlasEntryView | null;
  onClose: () => void;
  onDone: () => void;
};

export function EditLifecycleDialog({
  open,
  atlasId,
  entry,
  onClose,
  onDone,
}: LifecycleEditProps) {
  const [stages, setStages] = useState<StageDraft[]>([]);
  const [busy, setBusy] = useState<Busy>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entry) return;
    setStages(
      hydrateLifecycleDraft(
        structuredClone(entry.fields.lifecycleStages),
        entry.fields.diagnosticStage,
      ),
    );
    setError(null);
    setBusy(false);
  }, [open, entry]);

  const previewFields = useMemo((): DatasetFields | null => {
    if (!entry) return null;
    return previewLifecycleFields(entry.fields, stages);
  }, [entry, stages]);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!entry) return;
    setBusy(true);
    setError(null);
    try {
      const parsed = stages.map((s) => lifecycleStageSchema.parse(s));
      const ownershipError = diagnosticOwnershipIssue(parsed, null);
      if (ownershipError) {
        setError(
          ownershipError === "at most one diagnostic stage"
            ? "At most one diagnostic stage"
            : ownershipError,
        );
        setBusy(false);
        return;
      }
      const imageIds = new Set(entry.images.map((img) => img.id));
      for (const s of parsed) {
        if (s.imageId && !imageIds.has(s.imageId)) {
          setError(`Unknown image id: ${s.imageId}`);
          setBusy(false);
          return;
        }
      }
      const diagnosticStage = diagnosticMirrorForSave(
        parsed,
        entry.fields.diagnosticStage,
      );
      await patchEntry(atlasId, entry.id, {
        fields: {
          lifecycleStages: parsed as DatasetFields["lifecycleStages"],
          diagnosticStage,
        },
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errMessage(err, "Could not save lifecycle"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="lg"
    >
      <form onSubmit={onSubmit}>
        <DialogTitle>
          Edit lifecycle
          {entry ? (
            <>
              {" — "}
              <em>{entry.canonicalName}</em>
            </>
          ) : null}
        </DialogTitle>
        <DialogContent>
          {error ? (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          ) : null}
          <Stack spacing={2}>
            <StageListEditor
              stages={stages}
              onChange={setStages}
              disabled={busy}
            />
            <Box
              sx={{
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                p: 1.5,
              }}
            >
              <Typography sx={{ fontWeight: 600, mb: 1, fontSize: "0.9rem" }}>
                Live preview
              </Typography>
              {previewFields ? (
                <LifecycleSwimlane fields={previewFields} compactStepLabel />
              ) : null}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={busy || !entry}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

type DeletedProps = {
  open: boolean;
  atlasId: string;
  onClose: () => void;
  onChanged: () => void;
};

export function RecentlyDeletedDialog({
  open,
  atlasId,
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
        const list = await listDeletedEntries(atlasId);
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
  }, [open, atlasId]);

  async function onRestore(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await restoreEntry(atlasId, id);
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
      await purgeDeletedEntry(atlasId, entry.id);
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
                  {e.originKey == null ? (
                    <Button
                      size="small"
                      color="error"
                      disabled={busyId === e.id}
                      onClick={() => void onPurge(e)}
                    >
                      Delete permanently
                    </Button>
                  ) : null}
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

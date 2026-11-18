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
import LifecycleSwimlane from "./LifecycleSwimlane";
import { PARASITE_GROUPS } from "../../worker/atlas/templates/parasite";
import { entryTitles } from "./entryTitles";
import { GROUP_LABELS } from "./filter";
import StageListEditor from "./StageListEditor";
import type { AtlasEntryView, ParasiteGroup } from "./types";
import { useAddEntryDialog } from "./useAddEntryDialog";
import { useEditEntryDialog } from "./useEditEntryDialog";
import { useEditLifecycleDialog } from "./useEditLifecycleDialog";
import { useRecentlyDeletedDialog } from "./useRecentlyDeletedDialog";
import { shouldAutoFocusText } from "../lib/autoFocusText";

type AddProps = {
  open: boolean;
  atlasId: string;
  onClose: () => void;
  onDone: (entry: AtlasEntryView) => void;
};

export function AddEntryDialog({ open, atlasId, onClose, onDone }: AddProps) {
  const {
    name,
    setName,
    commonName,
    setCommonName,
    group,
    setGroup,
    busy,
    error,
    onSubmit,
  } = useAddEntryDialog({ open, atlasId, onClose, onDone });

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <form onSubmit={onSubmit}>
        <DialogTitle>Add entry</DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              autoFocus={shouldAutoFocusText()}
              label="Common name"
              value={commonName}
              onChange={(ev) => setCommonName(ev.target.value)}
              disabled={busy}
              fullWidth
              required
            />
            <TextField
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
  const {
    commonName,
    setCommonName,
    definitiveHosts,
    setDefinitiveHosts,
    busy,
    error,
    canReset,
    onSubmit,
    onSoftDelete,
    onReset,
  } = useEditEntryDialog({ open, atlasId, entry, onClose, onDone });

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} fullWidth maxWidth="xs">
      <form onSubmit={onSubmit}>
        <DialogTitle>
          Edit {entry ? entryTitles(entry).primary : "entry"}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={1.5} sx={{ pt: 0.5 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              autoFocus={shouldAutoFocusText()}
              label="Common name"
              value={commonName}
              onChange={(ev) => setCommonName(ev.target.value)}
              disabled={busy}
              fullWidth
              required
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
  const { stages, setStages, busy, error, previewFields, onSubmit } =
    useEditLifecycleDialog({ open, atlasId, entry, onClose, onDone });

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
              {entryTitles(entry).primary}
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
  const { entries, busyId, error, onRestore, onPurge } =
    useRecentlyDeletedDialog({ open, atlasId, onChanged });

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
                <Typography sx={{ fontWeight: 600 }}>
                  {entryTitles(e).primary}
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

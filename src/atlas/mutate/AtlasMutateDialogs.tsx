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
import LifecycleSwimlane from "../lifecycle/LifecycleSwimlane";
import { PARASITE_GROUPS } from "../../../worker/atlas/templates/parasite";
import { entryTitles } from "../entry/entryTitles";
import { GROUP_LABELS } from "../hub/filter";
import StageListEditor from "../lifecycle/StageListEditor";
import type { AtlasEntryView, ParasiteGroup } from "../types";
import { useAddEntryDialog } from "./useAddEntryDialog";
import { useEditLifecycleDialog } from "../lifecycle/useEditLifecycleDialog";
import { useRecentlyDeletedDialog } from "./useRecentlyDeletedDialog";
import { shouldAutoFocusText } from "../../shared/lib/autoFocusText";
import DialogEyebrow from "../../shared/ui/DialogEyebrow";

/** Deck Hub dialog title voice: Alice display, not form chrome. */
const LIFECYCLE_DIALOG_TITLE_SX = {
  p: 0,
  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
  fontWeight: 400,
  letterSpacing: "0.02em",
  lineHeight: 1.15,
  fontSize: "1.75rem",
} as const;

const LIFECYCLE_DIALOG_CANCEL_SX = {
  color: "text.secondary",
  textTransform: "none",
  fontWeight: 500,
  "&:hover": { color: "text.primary", bgcolor: "transparent" },
} as const;

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
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="xs"
    >
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
              onChange={(ev) => setGroup(ev.target.value as ParasiteGroup | "")}
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
  const primary = entry ? entryTitles(entry).primary : null;

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      fullWidth
      maxWidth="md"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            display: "flex",
            flexDirection: "column",
            maxHeight: "90vh",
            overflow: "hidden",
            bgcolor: "background.paper",
          },
        },
      }}
    >
      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          flex: 1,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            flex: "none",
            px: 3,
            pt: 2.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(91, 44, 111, 0.12) 0%, transparent 100%)",
          }}
        >
          <DialogEyebrow label="Lifecycle" />
          <DialogTitle sx={LIFECYCLE_DIALOG_TITLE_SX}>
            Edit lifecycle
          </DialogTitle>
          {primary ? (
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 1,
                maxWidth: "42ch"
              }}>
              {primary}
            </Typography>
          ) : null}
        </Box>
        <DialogContent
          dividers
          sx={{
            px: 3,
            py: 2,
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
          }}
        >
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
              sx={(theme) => ({
                border: 1,
                borderColor: "divider",
                borderRadius: 2,
                p: 1.5,
                ...theme.applyStyles("dark", {
                  bgcolor: "rgba(232, 216, 199, 0.04)",
                }),
              })}
            >
              <Typography
                sx={{
                  mb: 1,
                  fontSize: "0.6875rem",
                  fontWeight: 500,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: "text.secondary",
                }}
              >
                Live preview
              </Typography>
              {previewFields ? (
                <LifecycleSwimlane fields={previewFields} compactStepLabel />
              ) : null}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ flex: "none", px: 3, py: 2, gap: 1 }}>
          <Button onClick={onClose} disabled={busy} sx={LIFECYCLE_DIALOG_CANCEL_SX}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !entry}
            sx={{ textTransform: "none", borderRadius: 2, px: 2.25, fontWeight: 600 }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Box>
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
            <Typography sx={{
              color: "text.secondary"
            }}>Loading…</Typography>
          ) : entries.length === 0 ? (
            <Typography sx={{
              color: "text.secondary"
            }}>No deleted entries.</Typography>
          ) : (
            entries.map((e) => (
              <Stack
                key={e.id}
                direction={{ xs: "column", sm: "row" }}
                sx={{
                  alignItems: { sm: "center" },
                  justifyContent: "space-between",
                  gap: 1,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  px: 1.5,
                  py: 1
                }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {entryTitles(e).primary}
                </Typography>
                <Stack direction="row" sx={{
                  gap: 1
                }}>
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

import type { FormEvent } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DialogEyebrow from "../shared/ui/DialogEyebrow";
import { shouldAutoFocusText } from "../shared/lib/autoFocusText";

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  value: string;
  onValueChange: (v: string) => void;
  onClose: () => void;
  onSubmit: (ev: FormEvent) => void;
};

export default function DeckHubRenameDialog({
  open,
  busy,
  error,
  value,
  onValueChange,
  onClose,
  onSubmit,
}: Props) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            overflow: "hidden",
            bgcolor: "background.paper",
          },
        },
      }}
    >
      <Box component="form" onSubmit={onSubmit} noValidate>
        <Box
          sx={{
            px: 3,
            pt: 2.5,
            pb: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            background:
              "linear-gradient(180deg, rgba(91, 44, 111, 0.12) 0%, transparent 100%)",
          }}
        >
          <DialogEyebrow label="Rename" />
          <DialogTitle
            sx={{
              p: 0,
              fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
              fontWeight: 400,
              letterSpacing: "0.02em",
              lineHeight: 1.15,
              fontSize: "1.75rem",
            }}
          >
            Update the deck name
          </DialogTitle>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 1,
              maxWidth: "36ch",
            }}
          >
            Shown on the hub header and in your Library.
          </Typography>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}
          <TextField
            autoFocus={shouldAutoFocusText()}
            margin="none"
            label="Deck name"
            placeholder="e.g. Upper limb"
            value={value}
            onChange={(ev) => onValueChange(ev.target.value)}
            required
            fullWidth
            helperText={`${value.trim().length}/80`}
            slotProps={{
              htmlInput: { maxLength: 80, "aria-label": "Deck name" },
              formHelperText: { sx: { textAlign: "right", mx: 0 } },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={onClose}
            disabled={busy}
            sx={{ color: "text.secondary" }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={busy || !value.trim()}
            sx={{ minWidth: 112 }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

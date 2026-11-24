import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import DialogEyebrow from "../shared/ui/DialogEyebrow";
import type { MaterialListItem } from "../api/client";
import {
  DIALOG_CANCEL_SX,
  DIALOG_PAPER_SX,
  DIALOG_TITLE_SX,
  PRIMARY_PILL_SX,
} from "./deckHubDialogSx";

type Props = {
  target: MaterialListItem | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeckHubDeleteMaterialDialog({
  target,
  busy,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog
      open={target !== null}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: { sx: DIALOG_PAPER_SX },
      }}
    >
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          background:
            "linear-gradient(180deg, rgba(196, 165, 116, 0.12) 0%, transparent 100%)",
        }}
      >
        <DialogEyebrow label="Files" tone="warning" />
        <DialogTitle sx={DIALOG_TITLE_SX}>Delete file?</DialogTitle>
      </Box>
      <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
        <DialogContentText
          sx={{ color: "text.secondary", lineHeight: 1.55, m: 0 }}
        >
          {target
            ? `Remove “${
                target.filename?.trim() || "this file"
              }” from the deck. Cards already created stay.`
            : null}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={onClose} disabled={busy} sx={DIALOG_CANCEL_SX}>
          Cancel
        </Button>
        <Button
          color="warning"
          variant="contained"
          disabled={busy}
          onClick={onConfirm}
          sx={PRIMARY_PILL_SX}
        >
          {busy ? "Deleting…" : "Delete file"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

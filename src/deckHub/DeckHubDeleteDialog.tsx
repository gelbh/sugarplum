import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import DialogEyebrow from "../shared/ui/DialogEyebrow";

type DeleteStats = {
  accepted: number;
  draft: number;
  archived: number;
  materials: number;
};

type Props = {
  open: boolean;
  busy: boolean;
  title: string | null;
  stats: DeleteStats | null;
  onClose: () => void;
  onConfirm: () => void;
};

export default function DeckHubDeleteDialog({
  open,
  busy,
  title,
  stats,
  onClose,
  onConfirm,
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
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          background:
            "linear-gradient(180deg, rgba(183, 28, 28, 0.1) 0%, transparent 100%)",
        }}
      >
        <DialogEyebrow label="Delete" tone="error" />
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
          Remove this deck?
        </DialogTitle>
      </Box>
      <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
        <DialogContentText sx={{ color: "text.secondary" }}>
          {title && stats ? (
            <>
              Delete{" "}
              <Box component="strong" sx={{ color: "text.primary" }}>
                {title}
              </Box>
              ? This removes {stats.accepted} accepted card
              {stats.accepted === 1 ? "" : "s"}, {stats.draft}{" "}
              draft{stats.draft === 1 ? "" : "s"},{" "}
              {stats.archived} archived card
              {stats.archived === 1 ? "" : "s"}, and{" "}
              {stats.materials} material
              {stats.materials === 1 ? "" : "s"}.
            </>
          ) : title ? (
            <>Loading counts for {title}…</>
          ) : null}
        </DialogContentText>
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
          color="error"
          variant="contained"
          disabled={busy || !stats}
          onClick={onConfirm}
          sx={{ minWidth: 112 }}
        >
          {busy ? "Deleting…" : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

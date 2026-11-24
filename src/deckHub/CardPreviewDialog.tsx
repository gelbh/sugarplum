import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import type { CardDraftView } from "../api/client";
import { cardFrontPreview } from "../draftReview";
import DiyCardPreview from "./DiyCardPreview";
import { PILL_BTN } from "./workshopChrome";

type Props = {
  card: CardDraftView | null;
  busy?: boolean;
  onClose: () => void;
  onEdit: (card: CardDraftView) => void;
};

export default function CardPreviewDialog({
  card,
  busy = false,
  onClose,
  onEdit,
}: Props) {
  const open = card != null;
  const title = card ? cardFrontPreview(card) || "Card preview" : "Card preview";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="card-preview-dialog-title"
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            bgcolor: "#12070f",
            backgroundImage: "none",
            border: "1px solid rgba(232, 216, 199, 0.14)",
          },
        },
      }}
    >
      <DialogTitle
        id="card-preview-dialog-title"
        sx={{
          fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
          fontWeight: 400,
          pr: 2,
        }}
      >
        {title.length > 80 ? `${title.slice(0, 77)}…` : title}
      </DialogTitle>
      <DialogContent
        sx={{
          px: 2.5,
          pb: 1.5,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {card ? (
          <Box
            sx={{
              width: "100%",
              maxWidth: 420,
              aspectRatio: "var(--sp-card-aspect)",
              minHeight: 280,
            }}
          >
            <DiyCardPreview card={card} variant="editor" fillHeight />
          </Box>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.75, gap: 1 }}>
        <Button onClick={onClose} sx={{ ...PILL_BTN, color: "rgba(232, 216, 199, 0.75)" }}>
          Close
        </Button>
        {card ? (
          <Button
            variant="contained"
            disabled={busy}
            startIcon={<EditOutlinedIcon />}
            onClick={() => {
              onEdit(card);
              onClose();
            }}
            sx={PILL_BTN}
          >
            Edit card
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

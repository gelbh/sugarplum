import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import DialogEyebrow from "../../shared/ui/DialogEyebrow";
import {
  asRegenType,
  cardHasRegenSource,
  type CardDraftView,
} from "../../api/client";
import { DraftCardEditor, type DraftEditorChange } from "../../draftReview";
import { hubDiyTypes } from "../diy/hubDiyTypes";
import {
  DIALOG_CANCEL_SX,
  DIALOG_PAPER_SX,
  DIALOG_TITLE_SX,
  GHOST_PILL_SX,
  PRIMARY_PILL_SX,
} from "./deckHubDialogSx";

type Props = {
  card: CardDraftView | null;
  busy: boolean;
  saveBusy: boolean;
  error: string | null;
  guest: boolean;
  cardRegenBusy: boolean;
  onClose: () => void;
  onChange: (next: DraftEditorChange) => void;
  onSave: () => void;
  onMove: () => void;
  onRequestReset: () => void;
  onRegen: () => void;
};

export default function DeckHubEditCardDialog({
  card,
  busy,
  saveBusy,
  error,
  guest,
  cardRegenBusy,
  onClose,
  onChange,
  onSave,
  onMove,
  onRequestReset,
  onRegen,
}: Props) {
  return (
    <Dialog
      open={card !== null}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
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
            "linear-gradient(180deg, rgba(91, 44, 111, 0.14) 0%, transparent 100%)",
        }}
      >
        <DialogEyebrow label="Card" />
        <DialogTitle sx={DIALOG_TITLE_SX}>Edit card</DialogTitle>
      </Box>
      <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {card ? (
          <DraftCardEditor
            card={card}
            disabled={busy}
            onChange={onChange}
            allowedTypes={hubDiyTypes(guest)}
            regenAction={
              guest
                ? undefined
                : {
                    busy: cardRegenBusy,
                    disabled:
                      asRegenType(card.type) === null ||
                      !cardHasRegenSource(card),
                    onClick: () => {
                      onRegen();
                    },
                  }
            }
          />
        ) : null}
      </DialogContent>
      <DialogActions
        sx={{
          px: 3,
          py: 2,
          gap: 1,
          flexWrap: "wrap",
          justifyContent: "space-between",
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{
            flexWrap: "wrap",
          }}
        >
          <Button
            disabled={busy || !card}
            startIcon={<DriveFileMoveOutlinedIcon sx={{ fontSize: 18 }} />}
            onClick={onMove}
            sx={GHOST_PILL_SX}
          >
            Move
          </Button>
          <Button
            disabled={busy || !card}
            startIcon={<RestartAltRoundedIcon sx={{ fontSize: 18 }} />}
            onClick={onRequestReset}
            sx={{
              ...GHOST_PILL_SX,
              borderColor: "rgba(196, 165, 116, 0.35)",
              color: "var(--sp-grade-hard-fg, #e8d0a8)",
              "&:hover": {
                boxShadow: "none",
                borderColor: "rgba(196, 165, 116, 0.55)",
                bgcolor: "rgba(196, 165, 116, 0.12)",
              },
            }}
          >
            Reset schedule
          </Button>
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
          }}
        >
          <Button onClick={onClose} disabled={busy} sx={DIALOG_CANCEL_SX}>
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={busy || !card}
            onClick={onSave}
            sx={PRIMARY_PILL_SX}
          >
            {saveBusy ? "Saving…" : "Save"}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}

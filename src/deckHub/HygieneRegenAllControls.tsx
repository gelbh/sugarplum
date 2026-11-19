import { useRef, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  asRegenType,
  regenCard,
  type DeckHygieneCard,
} from "../api/client";
import { runHygieneRegenAll } from "./hygieneRegenAll";

const DIALOG_PAPER_SX = {
  borderRadius: 2,
  overflow: "hidden",
  bgcolor: "background.paper",
} as const;

const DIALOG_TITLE_SX = {
  p: 0,
  fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
  fontWeight: 400,
  letterSpacing: "0.02em",
  lineHeight: 1.2,
  fontSize: "1.65rem",
} as const;

const DIALOG_CANCEL_SX = {
  color: "text.secondary",
  textTransform: "none",
  fontWeight: 500,
  "&:hover": { color: "text.primary", bgcolor: "transparent" },
} as const;

const PRIMARY_PILL_SX = {
  minWidth: 112,
  px: 2.25,
  py: 0.95,
  borderRadius: 999,
  textTransform: "none",
  fontWeight: 600,
  boxShadow: "none",
  "&:hover": { boxShadow: "none" },
} as const;

export type HygieneRegenAllApi = {
  busy: boolean;
  triggerDisabled: boolean;
  openConfirm: () => void;
  status: ReactNode;
  dialog: ReactNode;
};

/** Confirm + sequential regen-all for hygiene rows; panel keeps list/row actions. */
export function useHygieneRegenAll(args: {
  cards: DeckHygieneCard[];
  disabled: boolean;
  onCardRemoved: (cardId: string) => void;
  reload: (opts?: { clearError?: boolean }) => Promise<void>;
  onChanged?: () => void;
}): HygieneRegenAllApi {
  const [busy, setBusy] = useState(false);
  const lockRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const eligibleCount = args.cards.filter(
    (card) => asRegenType(card.type) != null,
  ).length;

  async function runBatch() {
    if (lockRef.current) return;
    lockRef.current = true;
    const snapshot = args.cards.map((card) => ({
      id: card.id,
      type: card.type,
      front_preview: card.front_preview,
    }));
    const total = snapshot.filter((c) => asRegenType(c.type) != null).length;
    setConfirmOpen(false);
    setBusy(true);
    setBatchError(null);
    setProgress({ done: 0, total });
    try {
      const result = await runHygieneRegenAll({
        cards: snapshot,
        resolveType: asRegenType,
        regen: async (cardId, type) => {
          await regenCard(cardId, { type });
          args.onCardRemoved(cardId);
        },
        onProgress: (p) => setProgress(p),
      });
      if (result.failedAt) {
        const label =
          result.failedAt.front_preview.trim() || result.failedAt.id;
        const detail =
          result.error instanceof ApiError
            ? result.error.message
            : result.error instanceof Error
              ? result.error.message
              : "Could not regenerate";
        setBatchError(
          `Regenerated ${result.succeeded} of ${total}. Stopped on "${label}": ${detail}`,
        );
        await args.reload({ clearError: false });
      } else {
        await args.reload();
      }
      args.onChanged?.();
    } finally {
      lockRef.current = false;
      setBusy(false);
      setProgress(null);
    }
  }

  const status = (
    <>
      {progress ? (
        <Typography
          variant="caption"
          sx={{
            display: "block",
            mb: 1,
            color: "primary.light",
            letterSpacing: "0.04em",
          }}
        >
          Regenerating {progress.done} of {progress.total}…
        </Typography>
      ) : null}
      {batchError ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {batchError}
        </Alert>
      ) : null}
    </>
  );

  const dialog = (
    <Dialog
      open={confirmOpen}
      onClose={() => {
        if (!busy) setConfirmOpen(false);
      }}
      fullWidth
      maxWidth="xs"
      PaperProps={{ sx: DIALOG_PAPER_SX }}
    >
      <Box
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <DialogTitle sx={DIALOG_TITLE_SX}>
          Regenerate {eligibleCount} flagged card
          {eligibleCount === 1 ? "" : "s"}?
        </DialogTitle>
      </Box>
      <DialogContent sx={{ px: 3, pt: 2.5, pb: 1 }}>
        <DialogContentText
          sx={{ color: "text.secondary", lineHeight: 1.55, m: 0 }}
        >
          Each card regenerates one at a time with the same claim-aware path as
          the row Regen button. Schedules stay until a card succeeds. This uses
          free AI capacity and may take a few minutes. Per-row Regen stays
          available if you only want to fix one card.
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button
          onClick={() => setConfirmOpen(false)}
          disabled={busy}
          sx={DIALOG_CANCEL_SX}
        >
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => {
            void runBatch();
          }}
          disabled={busy || eligibleCount === 0}
          autoFocus
          sx={PRIMARY_PILL_SX}
        >
          Regen all
        </Button>
      </DialogActions>
    </Dialog>
  );

  return {
    busy,
    triggerDisabled: args.disabled || busy || eligibleCount === 0,
    openConfirm: () => {
      setBatchError(null);
      setConfirmOpen(true);
    },
    status,
    dialog,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  getDeckHygiene,
  waitForCardRegenOp,
  type CardDraftView,
  type DeckHygieneCard,
} from "../../api/client";
import CardPreviewDialog from "../cards/CardPreviewDialog";
import { useHygieneRegenAll } from "./HygieneRegenAllControls";
import HygieneCardRow from "./HygieneCardRow";
import { PILL_BTN } from "../workshop/workshopChrome";

const VISIBLE_LIMIT = 5;

type Props = {
  deckId: string;
  resolveCard: (id: string) => CardDraftView | null;
  onEdit: (card: CardDraftView) => void;
  onChanged?: () => void;
};

export default function DeckHygienePanel({
  deckId,
  resolveCard,
  onEdit,
  onChanged,
}: Props) {
  const [cards, setCards] = useState<DeckHygieneCard[]>([]);
  const [previewCard, setPreviewCard] = useState<CardDraftView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const resumedOpsRef = useRef(new Set<string>());

  const load = useCallback(async (opts?: { clearError?: boolean }) => {
    setLoading(true);
    if (opts?.clearError !== false) setError(null);
    try {
      const res = await getDeckHygiene(deckId);
      setCards(res.cards);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not load card hygiene",
      );
    } finally {
      setLoading(false);
    }
  }, [deckId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const inflight = cards.filter(
      (c) => c.regen_op && !resumedOpsRef.current.has(c.regen_op.id),
    );
    if (inflight.length === 0) return;
    let cancelled = false;
    const ownedOpIds: string[] = [];
    void (async () => {
      for (const c of inflight) {
        const opId = c.regen_op!.id;
        resumedOpsRef.current.add(opId);
        ownedOpIds.push(opId);
        setBusyId(c.id);
        try {
          await waitForCardRegenOp(opId);
        } catch (err) {
          if (!cancelled) {
            setError(
              err instanceof ApiError
                ? err.message
                : "Could not regenerate",
            );
          }
        } finally {
          setBusyId(null);
        }
      }
      if (!cancelled) await load({ clearError: false });
    })();
    return () => {
      cancelled = true;
      for (const id of ownedOpIds) resumedOpsRef.current.delete(id);
      setBusyId(null);
    };
  }, [cards, load]);

  const regenAll = useHygieneRegenAll({
    cards,
    disabled: busyId != null,
    onCardRemoved: (cardId) => {
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    },
    reload: load,
    onChanged,
  });

  const busy = regenAll.busy || busyId != null;

  if (loading && cards.length === 0 && !regenAll.busy) return null;
  if (!error && cards.length === 0 && !regenAll.busy) return null;

  const visible =
    showAll || cards.length <= VISIBLE_LIMIT
      ? cards
      : cards.slice(0, VISIBLE_LIMIT);
  const hiddenCount = cards.length - visible.length;

  return (
    <Box
      sx={{
        mb: 2,
        px: 1.5,
        py: 1.35,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "rgba(209, 163, 226, 0.28)",
        bgcolor: "rgba(91, 44, 111, 0.22)",
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{
          alignItems: "center",
          flexWrap: "wrap",
          mb: 0.75
        }}>
        <Typography
          component="h3"
          sx={{
            m: 0,
            fontFamily: '"Alice", "Georgia", "Times New Roman", serif',
            fontSize: "1.15rem",
            fontWeight: 400,
            lineHeight: 1.25,
            color: "rgba(245, 245, 245, 0.96)",
          }}
        >
          Cards to tidy
        </Typography>
        <Chip
          size="small"
          label={`${cards.length} to tidy`}
          sx={{
            height: 22,
            borderRadius: 999,
            border: "1px solid",
            borderColor: "rgba(209, 163, 226, 0.35)",
            bgcolor: "rgba(18, 7, 15, 0.35)",
            color: "rgba(232, 216, 199, 0.82)",
            "& .MuiChip-label": {
              px: 0.9,
              typography: "caption",
              fontSize: "0.6875rem",
              letterSpacing: "0.04em",
            },
          }}
        />
        <Box sx={{ flex: 1, minWidth: 8 }} />
        <Button
          size="small"
          variant="text"
          disabled={regenAll.triggerDisabled}
          onClick={regenAll.openConfirm}
          sx={{
            ...PILL_BTN,
            minWidth: 0,
            px: 1.15,
            py: 0.35,
            fontSize: "0.75rem",
            letterSpacing: "0.04em",
            color: "rgba(232, 216, 199, 0.72)",
            "&:hover": {
              ...PILL_BTN["&:hover"],
              color: "primary.light",
              bgcolor: "rgba(91, 44, 111, 0.22)",
            },
          }}
        >
          Regen all flagged
        </Button>
      </Stack>
      <Typography
        variant="caption"
        sx={{
          display: "block",
          mb: 1.25,
          color: "rgba(232, 216, 199, 0.62)",
          lineHeight: 1.45,
        }}
      >
        Essay or compound accepted cards. Regenerate or archive only when you
        choose; schedules stay until then.
      </Typography>
      {regenAll.status}
      {error ? (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      ) : null}
      <Stack spacing={0.85}>
        {visible.map((card) => (
          <HygieneCardRow
            key={card.id}
            card={card}
            busy={busy}
            busyId={busyId}
            resolveCard={resolveCard}
            onEdit={onEdit}
            onPreview={setPreviewCard}
            load={load}
            onChanged={onChanged}
            setBusyId={setBusyId}
            setError={setError}
          />
        ))}
      </Stack>
      {hiddenCount > 0 ? (
        <Button
          size="small"
          disabled={busy}
          onClick={() => setShowAll(true)}
          sx={{
            ...PILL_BTN,
            mt: 1,
            px: 1.15,
            color: "rgba(232, 216, 199, 0.72)",
            "&:hover": {
              ...PILL_BTN["&:hover"],
              color: "primary.light",
              bgcolor: "rgba(91, 44, 111, 0.22)",
            },
          }}
        >
          Show {hiddenCount} more
        </Button>
      ) : null}
      {regenAll.dialog}
      <CardPreviewDialog
        card={previewCard}
        busy={busy}
        onClose={() => setPreviewCard(null)}
        onEdit={onEdit}
      />
    </Box>
  );
}

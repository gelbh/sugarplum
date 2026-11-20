import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import {
  ApiError,
  archiveCard,
  asRegenType,
  getDeckHygiene,
  regenCard,
  waitForCardRegenOp,
  type DeckHygieneCard,
} from "../api/client";
import { useHygieneRegenAll } from "./HygieneRegenAllControls";
import { PILL_BTN, ROW_ACTION } from "./workshopChrome";

const SPIN_ICON_SX = {
  fontSize: 16,
  animation: "sp-hygiene-spin 1s linear infinite",
  "@keyframes sp-hygiene-spin": {
    to: { transform: "rotate(360deg)" },
  },
} as const;

const VISIBLE_LIMIT = 5;

const REASON_LABELS: Record<string, string> = {
  essay_back: "Essay answer",
  compound_front: "Compound prompt",
};

function reasonLabel(reason: string): string {
  return (REASON_LABELS[reason] ?? reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()));
}

type Props = {
  deckId: string;
  onChanged?: () => void;
};

export default function DeckHygienePanel({ deckId, onChanged }: Props) {
  const [cards, setCards] = useState<DeckHygieneCard[]>([]);
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
    void (async () => {
      for (const c of inflight) {
        const opId = c.regen_op!.id;
        resumedOpsRef.current.add(opId);
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
          if (!cancelled) setBusyId(null);
        }
      }
      if (!cancelled) await load({ clearError: false });
    })();
    return () => {
      cancelled = true;
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
        {visible.map((card) => {
          const regenType = asRegenType(card.type);
          const regenerating =
            busyId === card.id || card.regen_op != null;
          return (
            <Stack
              key={card.id}
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              sx={{
                alignItems: { sm: "center" },
                justifyContent: "space-between",
                px: 1,
                py: 0.85,
                borderRadius: 2,
                border: "1px solid",
                borderColor: "rgba(232, 216, 199, 0.12)",
                bgcolor: "rgba(18, 7, 15, 0.35)"
              }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: "center",
                  minWidth: 0,
                  flex: 1
                }}>
                <Box
                  aria-hidden
                  sx={{
                    flexShrink: 0,
                    width: 42,
                    height: 58,
                    borderRadius: 1,
                    bgcolor: "var(--sp-card-face)",
                    border: "1px solid",
                    borderColor: "rgba(232, 216, 199, 0.22)",
                    px: 0.55,
                    py: 0.45,
                    overflow: "hidden",
                    display: { xs: "none", sm: "block" },
                  }}
                >
                  <Typography
                    sx={{
                      m: 0,
                      fontSize: "0.45rem",
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "rgba(30, 13, 27, 0.45)",
                      lineHeight: 1.2,
                    }}
                  >
                    Front
                  </Typography>
                  <Typography
                    sx={{
                      m: 0,
                      mt: 0.35,
                      fontSize: "0.55rem",
                      lineHeight: 1.25,
                      color: "rgba(30, 13, 27, 0.82)",
                      display: "-webkit-box",
                      WebkitLineClamp: 4,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {card.front_preview || "(no front)"}
                  </Typography>
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="body2"
                    noWrap
                    title={card.front_preview}
                    sx={{
                      fontWeight: 500,
                      color: "rgba(245, 245, 245, 0.92)",
                      lineHeight: 1.35,
                    }}
                  >
                    {card.front_preview || "(no front)"}
                  </Typography>
                  <Stack
                    direction="row"
                    spacing={0.5}
                    useFlexGap
                    sx={{
                      flexWrap: "wrap",
                      mt: 0.55
                    }}>
                    {card.reasons.map((reason) => (
                      <Chip
                        key={reason}
                        size="small"
                        label={reasonLabel(reason)}
                        variant="outlined"
                        sx={{
                          height: 22,
                          borderRadius: 999,
                          borderColor: "rgba(232, 216, 199, 0.18)",
                          bgcolor: "rgba(18, 7, 15, 0.35)",
                          color: "rgba(232, 216, 199, 0.72)",
                          "& .MuiChip-label": {
                            px: 0.85,
                            typography: "caption",
                            fontSize: "0.6875rem",
                            letterSpacing: "0.04em",
                          },
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              </Stack>
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  flexShrink: 0,
                  alignItems: "center"
                }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={
                    <AutorenewRoundedIcon
                      sx={regenerating ? SPIN_ICON_SX : { fontSize: 16 }}
                    />
                  }
                  disabled={busy || regenerating || regenType == null}
                  onClick={() => {
                    if (regenType == null || regenerating) return;
                    void (async () => {
                      setBusyId(card.id);
                      setError(null);
                      try {
                        await regenCard(card.id, { type: regenType });
                        await load();
                        onChanged?.();
                      } catch (err) {
                        setError(
                          err instanceof ApiError
                            ? err.message
                            : "Could not regenerate",
                        );
                      } finally {
                        setBusyId(null);
                      }
                    })();
                  }}
                  sx={{
                    ...PILL_BTN,
                    minWidth: 0,
                    px: 1.15,
                    py: 0.35,
                    fontSize: "0.75rem",
                    letterSpacing: "0.04em",
                    borderColor: "rgba(209, 163, 226, 0.42)",
                    color: "primary.light",
                    "&:hover": {
                      ...PILL_BTN["&:hover"],
                      borderColor: "rgba(209, 163, 226, 0.65)",
                      bgcolor: "rgba(91, 44, 111, 0.28)",
                    },
                  }}
                >
                  {regenerating ? "Regenerating…" : "Regen"}
                </Button>
                <Tooltip title="Archive">
                  <span>
                    <IconButton
                      size="small"
                      aria-label="Archive card"
                      disabled={busy}
                      onClick={() => {
                        void (async () => {
                          setBusyId(card.id);
                          setError(null);
                          try {
                            await archiveCard(card.id);
                            await load();
                            onChanged?.();
                          } catch (err) {
                            setError(
                              err instanceof ApiError
                                ? err.message
                                : "Could not archive",
                            );
                          } finally {
                            setBusyId(null);
                          }
                        })();
                      }}
                      sx={ROW_ACTION}
                    >
                      <ArchiveOutlinedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>
          );
        })}
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
    </Box>
  );
}

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import {
  ApiError,
  archiveCard,
  asRegenType,
  regenCard,
  type CardDraftView,
  type DeckHygieneCard,
} from "../../api/client";
import { PILL_BTN, ROW_ACTION } from "../workshop/workshopChrome";
import { reasonLabel } from "./hygieneReasons";

const SPIN_ICON_SX = {
  fontSize: 16,
  animation: "sp-hygiene-spin 1s linear infinite",
  "@keyframes sp-hygiene-spin": {
    to: { transform: "rotate(360deg)" },
  },
} as const;

type Props = {
  card: DeckHygieneCard;
  busy: boolean;
  busyId: string | null;
  resolveCard: (id: string) => CardDraftView | null;
  onEdit: (card: CardDraftView) => void;
  onPreview: (card: CardDraftView) => void;
  load: () => Promise<void>;
  onChanged?: () => void;
  setBusyId: (id: string | null) => void;
  setError: (msg: string | null) => void;
};

export default function HygieneCardRow({
  card,
  busy,
  busyId,
  resolveCard,
  onEdit,
  onPreview,
  load,
  onChanged,
  setBusyId,
  setError,
}: Props) {
  const regenType = asRegenType(card.type);
  const regenerating = busyId === card.id || card.regen_op != null;
  const resolved = resolveCard(card.id);
  function openPreview() {
    const full = resolveCard(card.id);
    if (full) onPreview(full);
  }
  return (
    <Stack
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
                  component="button"
                  type="button"
                  aria-label={`Preview ${card.front_preview || "card"}`}
                  disabled={resolved == null}
                  onClick={openPreview}
                  sx={{
                    flexShrink: 0,
                    width: 42,
                    height: 58,
                    m: 0,
                    borderRadius: 1,
                    bgcolor: "var(--sp-card-face)",
                    border: "1px solid",
                    borderColor: "rgba(232, 216, 199, 0.22)",
                    px: 0.55,
                    py: 0.45,
                    overflow: "hidden",
                    display: { xs: "none", sm: "block" },
                    cursor: resolved ? "pointer" : "default",
                    textAlign: "left",
                    opacity: resolved ? 1 : 0.55,
                    "&:hover": resolved
                      ? { borderColor: "rgba(209, 163, 226, 0.55)" }
                      : undefined,
                    "&:focus-visible": {
                      outline: "2px solid rgba(209, 163, 226, 0.75)",
                      outlineOffset: 2,
                    },
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
                    component="button"
                    type="button"
                    variant="body2"
                    noWrap
                    title={card.front_preview}
                    disabled={resolved == null}
                    onClick={openPreview}
                    sx={{
                      display: "block",
                      width: "100%",
                      p: 0,
                      m: 0,
                      border: 0,
                      bgcolor: "transparent",
                      cursor: resolved ? "pointer" : "default",
                      textAlign: "left",
                      fontWeight: 500,
                      color: "rgba(245, 245, 245, 0.92)",
                      lineHeight: 1.35,
                      opacity: resolved ? 1 : 0.7,
                      "&:hover": resolved
                        ? { color: "primary.light" }
                        : undefined,
                      "&:focus-visible": {
                        outline: "2px solid rgba(209, 163, 226, 0.75)",
                        outlineOffset: 2,
                      },
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
                <Tooltip title="Edit card">
                  <span>
                    <IconButton
                      size="small"
                      aria-label="Edit card"
                      disabled={busy || regenerating || resolved == null}
                      onClick={() => {
                        if (resolved) onEdit(resolved);
                      }}
                      sx={ROW_ACTION}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
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
                      disabled={busy || regenerating}
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
}

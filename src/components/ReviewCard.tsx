import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CardDraftView, CardType, StudyRating } from "../api/client";
import { CARD_TYPE_ICONS } from "../lib/cardTypeIcons";
import {
  draftFaceKind,
  draftForType,
  TYPE_LABELS,
  typeSelectModel,
  type DraftEditorChange,
} from "../lib/draftCardModel";
import { SelectEnumItem, renderSelectEnumValue } from "./SelectEnumItem";
import {
  REJECT_REASONS,
  REJECT_REASON_LABELS,
  type RejectReason,
} from "../lib/rejectReasons";
import { type ReviewSwipeDecision } from "../study/cardGestures";
import { gradeColorVars } from "../study/gradeColors";
import { StudyCardPlate } from "./CardFace";
import { OcclusionReviewFace, TextReviewFace } from "./reviewCardFaces";
import { ReviewMcqFace } from "./reviewCardMcq";
import { FACE_SANS, FACE_SX } from "./studyFaceSx";
import { useReviewSwipe } from "./useReviewSwipe";

export type ReviewDecision = ReviewSwipeDecision;

export type ReviewCardProps = {
  card: CardDraftView;
  remaining: number;
  disabled?: boolean;
  stackBehind: boolean;
  /** Fill parent height instead of fixed dvh card face (draft review viewport fit). */
  fillHeight?: boolean;
  regen: { busy: boolean; disabled: boolean; onClick: () => void };
  onChange: (next: DraftEditorChange) => void;
  /** Resolve true once the card was decided; false unlocks it again. */
  onDecide: (
    decision: ReviewDecision,
    reason: RejectReason | null,
  ) => Promise<boolean>;
};

const STAGE_SELECT_SX = {
  minWidth: 168,
  color: "var(--sp-ivory)",
  "& .MuiOutlinedInput-notchedOutline": {
    borderColor: "color-mix(in srgb, var(--sp-ivory) 35%, transparent)",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "color-mix(in srgb, var(--sp-ivory) 60%, transparent)",
  },
  "& .MuiSelect-icon": { color: "inherit" },
  "&&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--sp-ivory)",
  },
  "&&.Mui-disabled": {
    color: "color-mix(in srgb, var(--sp-ivory) 55%, transparent)",
  },
  "&&.Mui-disabled .MuiSelect-select": {
    WebkitTextFillColor: "color-mix(in srgb, var(--sp-ivory) 55%, transparent)",
  },
  "&&.Mui-disabled .MuiOutlinedInput-notchedOutline": {
    borderColor: "color-mix(in srgb, var(--sp-ivory) 20%, transparent)",
  },
} as const;

function StageTypeSelect({
  card,
  disabled,
  onChange,
}: {
  card: CardDraftView;
  disabled: boolean;
  onChange: (next: DraftEditorChange) => void;
}) {
  const model = typeSelectModel(card.type as CardType);
  return (
    <Select
      size="small"
      value={model.value}
      disabled={disabled || model.locked}
      onChange={(e) => onChange(draftForType(card, e.target.value as CardType))}
      SelectDisplayProps={{ "aria-label": "Card type" }}
      sx={STAGE_SELECT_SX}
      renderValue={(value) =>
        renderSelectEnumValue({
          icon: CARD_TYPE_ICONS[value as CardType],
          label: TYPE_LABELS[value as CardType],
        })
      }
      MenuProps={{
        slotProps: {
          paper: {
            sx: {
              bgcolor: "var(--sp-stage-deep, #180816)",
              color: "var(--sp-ivory)",
              borderColor:
                "color-mix(in srgb, var(--sp-ivory) 24%, transparent)",
              "& .MuiMenuItem-root.Mui-selected": {
                bgcolor: "rgba(206, 147, 216, 0.16)",
              },
              "& .MuiMenuItem-root.Mui-selected:hover": {
                bgcolor: "rgba(206, 147, 216, 0.24)",
              },
            },
          },
        },
      }}
    >
      {model.options.map((t) => (
        <MenuItem key={t} value={t}>
          <SelectEnumItem icon={CARD_TYPE_ICONS[t]} label={TYPE_LABELS[t]} />
        </MenuItem>
      ))}
    </Select>
  );
}

function RoundAction({
  label,
  rating,
  size,
  disabled,
  onClick,
  children,
}: {
  label: string;
  rating: StudyRating;
  size: number;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const c = gradeColorVars(rating);
  return (
    <IconButton
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      sx={{
        width: size,
        height: size,
        color: c.fg,
        bgcolor: c.wash,
        border: "1px solid",
        borderColor: c.border,
        "&:hover": { bgcolor: c.wash, filter: "brightness(1.12)" },
        "&:active": { transform: "scale(0.95)" },
        "&.Mui-disabled": { opacity: 0.35, color: c.fg, borderColor: c.border },
      }}
    >
      {children}
    </IconButton>
  );
}

export default function ReviewCard({
  card,
  remaining,
  disabled = false,
  stackBehind,
  fillHeight = false,
  regen,
  onChange,
  onDecide,
}: ReviewCardProps) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const active = document.activeElement;
    if (active instanceof Node && root.contains(active)) return;
    root.focus({ preventScroll: true });
  }, []);
  const swipe = useReviewSwipe({
    locked: disabled,
    stageRef,
    onCommit: (decision) =>
      onDecide(decision, decision === "reject" ? reason : null),
  });
  const locked = disabled || swipe.leaving !== null;
  const again = gradeColorVars(1);

  const faceProps = { card, disabled: locked, onChange };
  let face: ReactNode;
  const kind = draftFaceKind(card);
  switch (kind) {
    case "mcq":
      face = <ReviewMcqFace {...faceProps} />;
      break;
    case "occlusion":
      face = <OcclusionReviewFace {...faceProps} />;
      break;
    case "text":
      face = <TextReviewFace key={card.type} {...faceProps} />;
      break;
    default: {
      const unreachable: never = kind;
      throw new Error(`Unhandled draft face kind: ${String(unreachable)}`);
    }
  }

  return (
    <Stack
      ref={stageRef}
      tabIndex={-1}
      spacing={fillHeight ? 1.25 : 2}
      sx={{
        outline: "none",
        ...(fillHeight
          ? { flex: 1, minHeight: 0, height: "100%" }
          : {}),
        "&:focus-visible": {
          outline: "2px solid var(--sp-ivory)",
          outlineOffset: 2,
        },
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0
        }}>
        <Typography
          variant="caption"
          sx={{
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            opacity: 0.75,
          }}
        >
          {remaining} to review
        </Typography>
        <StageTypeSelect card={card} disabled={locked} onChange={onChange} />
      </Stack>

      <Box
        sx={{
          position: "relative",
          ...(fillHeight
            ? { flex: 1, minHeight: 140 }
            : {
                height: {
                  xs: "min(42dvh, 360px)",
                  sm: "min(48dvh, 420px)",
                },
              }),
        }}
      >
        {stackBehind ? (
          <Box
            aria-hidden
            sx={{
              position: "absolute",
              inset: 0,
              transform: "translateY(18px) scale(0.95)",
              opacity: 0.55,
              pointerEvents: "none",
            }}
          >
            <StudyCardPlate>
              <Paper
                elevation={0}
                className="sp-playing-card"
                sx={{ ...FACE_SX, height: "100%" }}
              />
            </StudyCardPlate>
          </Box>
        ) : null}
        <Box
          ref={swipe.plateRef}
          {...swipe.handlers}
          sx={{
            position: "absolute",
            inset: 0,
            touchAction: "pan-y",
            userSelect: "none",
            "&:has(textarea:focus, input:focus)": { userSelect: "auto" },
          }}
        >
          <Box
            ref={swipe.stampRef}
            aria-hidden
            sx={{
              position: "absolute",
              top: 28,
              left: "50%",
              zIndex: 2,
              pointerEvents: "none",
              px: 1.5,
              py: 0.5,
              border: "2px solid",
              bgcolor: "var(--sp-card-face)",
              borderRadius: 1,
              fontFamily: FACE_SANS,
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          />
          {face}
        </Box>
      </Box>

      <Stack
        spacing={0.75}
        role="group"
        aria-labelledby="reject-reason-label"
        sx={{
          alignItems: "center",
          flexShrink: 0
        }}>
        <Typography
          id="reject-reason-label"
          variant="caption"
          sx={{ opacity: 0.72, letterSpacing: "0.04em" }}
        >
          Reason (optional)
        </Typography>
        <Stack
          direction="row"
          spacing={0.75}
          useFlexGap
          sx={{
            flexWrap: "wrap",
            justifyContent: "center"
          }}>
          {REJECT_REASONS.map((code) => {
            const selected = reason === code;
            return (
              <Chip
                key={code}
                label={REJECT_REASON_LABELS[code]}
                size="small"
                clickable
                variant="outlined"
                aria-pressed={selected}
                disabled={locked}
                onClick={() => setReason(selected ? null : code)}
                sx={
                  selected
                    ? {
                        color: again.fg,
                        bgcolor: again.wash,
                        borderColor: again.border,
                        "&:hover": { bgcolor: again.wash },
                      }
                    : {
                        color: "inherit",
                        borderColor:
                          "color-mix(in srgb, var(--sp-ivory) 35%, transparent)",
                        "&:hover": {
                          bgcolor:
                            "color-mix(in srgb, var(--sp-ivory) 12%, transparent)",
                        },
                      }
                }
              />
            );
          })}
        </Stack>
      </Stack>

      <Stack
        direction="row"
        spacing={3}
        sx={{
          justifyContent: "center",
          alignItems: "center",
          flexShrink: 0
        }}>
        <RoundAction
          label="Reject card"
          rating={1}
          size={56}
          disabled={locked}
          onClick={() => void swipe.commit("reject")}
        >
          <CloseIcon />
        </RoundAction>
        <Tooltip title="Regenerate card">
          <span>
            <RoundAction
              label="Regenerate card"
              rating={2}
              size={44}
              disabled={locked || regen.busy || regen.disabled}
              onClick={regen.onClick}
            >
              {regen.busy ? (
                <CircularProgress size={18} color="inherit" />
              ) : (
                <AutorenewIcon fontSize="small" />
              )}
            </RoundAction>
          </span>
        </Tooltip>
        <RoundAction
          label="Accept card"
          rating={4}
          size={56}
          disabled={locked}
          onClick={() => void swipe.commit("accept")}
        >
          <CheckIcon />
        </RoundAction>
      </Stack>
    </Stack>
  );
}

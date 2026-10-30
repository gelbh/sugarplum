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
import { useState, type ReactNode } from "react";
import type { CardDraftView, CardType, StudyRating } from "../api/client";
import {
  draftFaceKind,
  draftForType,
  TYPE_LABELS,
  typeSelectModel,
  type DraftEditorChange,
} from "../lib/draftCardModel";
import {
  REJECT_REASONS,
  REJECT_REASON_LABELS,
  type RejectReason,
} from "../lib/rejectReasons";
import {
  REVIEW_FLY_MS,
  reviewSwipeVisual,
  type ReviewSwipeDecision,
} from "../study/cardGestures";
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
  /** Decorative stack edge behind the card when more drafts remain. */
  stackBehind: boolean;
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
    borderColor: "rgba(232, 216, 199, 0.35)",
  },
  "&:hover .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(232, 216, 199, 0.6)",
  },
  "& .MuiSelect-icon": { color: "inherit" },
  "&&.Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: "var(--sp-ivory)",
  },
  "&&.Mui-disabled": { color: "rgba(232, 216, 199, 0.55)" },
  "&&.Mui-disabled .MuiSelect-select": {
    WebkitTextFillColor: "rgba(232, 216, 199, 0.55)",
  },
  "&&.Mui-disabled .MuiOutlinedInput-notchedOutline": {
    borderColor: "rgba(232, 216, 199, 0.2)",
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
    >
      {model.options.map((t) => (
        <MenuItem key={t} value={t}>
          {TYPE_LABELS[t]}
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

/** Draft review card on the stage: Study plate, edit in place, swipe or tap to decide. */
export default function ReviewCard({
  card,
  remaining,
  disabled = false,
  stackBehind,
  regen,
  onChange,
  onDecide,
}: ReviewCardProps) {
  const [reason, setReason] = useState<RejectReason | null>(null);
  const swipe = useReviewSwipe({
    locked: disabled,
    onCommit: (decision) =>
      onDecide(decision, decision === "reject" ? reason : null),
  });
  const locked = disabled || swipe.leaving !== null;
  const again = gradeColorVars(1);
  const visual = reviewSwipeVisual({
    dx: swipe.dx ?? 0,
    leaving: swipe.leaving,
    reduceMotion: swipe.reduceMotion,
  });
  const stampColors = gradeColorVars(visual.stamp === "accept" ? 4 : 1);

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
    <Stack spacing={2}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1.5}
      >
        <Typography
          variant="caption"
          sx={{ letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0.75 }}
        >
          {remaining} to review
        </Typography>
        <StageTypeSelect card={card} disabled={locked} onChange={onChange} />
      </Stack>

      <Box
        sx={{ position: "relative", height: { xs: "min(52vh, 504px)", sm: 504 } }}
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
          {...swipe.handlers}
          sx={{
            position: "absolute",
            inset: 0,
            touchAction: "pan-y",
            userSelect: "none",
            "&:has(textarea:focus, input:focus)": { userSelect: "auto" },
            transform: visual.transform,
            transition:
              swipe.reduceMotion || (swipe.dx !== null && !swipe.leaving)
                ? "none"
                : `transform ${REVIEW_FLY_MS}ms ease-out`,
            opacity: visual.dimmed ? 0.4 : 1,
          }}
        >
          {visual.stamp ? (
            <Box
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
                borderColor: stampColors.border,
                color: stampColors.border,
                bgcolor: "var(--sp-card-face)",
                borderRadius: 1,
                fontFamily: FACE_SANS,
                fontWeight: 600,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: visual.stampOpacity,
                transform: `translateX(-50%) rotate(${visual.stamp === "accept" ? -10 : 10}deg)`,
              }}
            >
              {visual.stamp === "accept" ? "Accept" : "Reject"}
            </Box>
          ) : null}
          {face}
        </Box>
      </Box>

      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
        alignItems="center"
        justifyContent="center"
        role="group"
        aria-labelledby="reject-reason-label"
      >
        <Typography id="reject-reason-label" variant="caption" sx={{ opacity: 0.75 }}>
          Reason (optional)
        </Typography>
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
                  ? { color: again.fg, bgcolor: again.wash, borderColor: again.border }
                  : { color: "inherit", borderColor: "rgba(232, 216, 199, 0.35)" }
              }
            />
          );
        })}
      </Stack>

      <Stack direction="row" spacing={3} justifyContent="center" alignItems="center">
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

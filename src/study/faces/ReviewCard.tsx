import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AutorenewIcon from "@mui/icons-material/Autorenew";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { CardDraftView } from "../../api/client";
import { draftFaceKind, type DraftEditorChange } from "../../draftReview/kernel";
import {
  REJECT_REASONS,
  REJECT_REASON_LABELS,
  type RejectReason,
} from "../../draftReview/kernel";
import { type ReviewSwipeDecision } from "../gestures/cardGestures";
import { gradeColorVars } from "../grading/gradeColors";
import { StudyCardPlate } from "./cardPlates";
import { RoundAction, StageTypeSelect } from "./reviewCardChrome";
import {
  OcclusionReviewFace,
  TextReviewFace,
  type OcclusionRegionEditorSlot,
} from "./reviewCardFaces";
import { ReviewMcqFace } from "./reviewCardMcq";
import { FACE_SANS, FACE_SX } from "./studyFaceSx";
import { useReviewSwipe } from "../gestures/useReviewSwipe";

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
  /** Routes compose OcclusionRegionEditor (study stays draftReview-UI-free). */
  renderOcclusionRegionEditor: OcclusionRegionEditorSlot;
  /** Resolve true once the card was decided; false unlocks it again. */
  onDecide: (
    decision: ReviewDecision,
    reason: RejectReason | null,
  ) => Promise<boolean>;
};

export default function ReviewCard({
  card,
  remaining,
  disabled = false,
  stackBehind,
  fillHeight = false,
  regen,
  onChange,
  renderOcclusionRegionEditor,
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
      face = (
        <OcclusionReviewFace
          {...faceProps}
          renderOcclusionRegionEditor={renderOcclusionRegionEditor}
        />
      );
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
        width: "100%",
        maxWidth: 400,
        alignSelf: "center",
        ...(fillHeight
          ? { flex: 1, minHeight: 0, height: "100%" }
          : {}),
      }}
    >
      <Stack
        direction="row"
        spacing={1.5}
        sx={{
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
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
            ? { flex: 1, minHeight: 140, overflow: "hidden" }
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
          flexShrink: 0,
        }}
      >
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
            justifyContent: "center",
          }}
        >
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
          flexShrink: 0,
        }}
      >
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

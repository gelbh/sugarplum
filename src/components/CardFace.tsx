import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { MouseEvent, Ref } from "react";
import { mediaUrl, type StudyRating } from "../api/client";
import {
  blankClozeFront,
  clozeExtraSubtitle,
  extractClozeAnswer,
} from "../lib/clozeFormat";
import { CardFaceMcqBody } from "./cardFaceMcq";
import { CARD_COLUMN_SX, FACE_SANS, FACE_SX, OVERLINE_SX } from "./studyFaceSx";

/** Normalized 0–1 hide_one box over the study image until reveal. */
export type OcclusionMaskBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OcclusionStudyFace = {
  imageKey: string;
  mask: OcclusionMaskBox;
};

type Props = {
  front: string;
  back: string;
  type?: string;
  revealed: boolean;
  onReveal: () => void;
  /** Flip from answer back to the question face. */
  onFlipBack: () => void;
  disabled?: boolean;
  mediaR2Keys?: string[];
  /** When set, front masks this region; back shows the same image unmasked. */
  occlusion?: OcclusionStudyFace;
  /** Focus target for the answer face after reveal. */
  answerFocusRef?: Ref<HTMLElement | null>;
  /** Focus target for Show answer after grading / flip-back. */
  showAnswerRef?: Ref<HTMLButtonElement | null>;
  /** Required when `type === "mcq"`. */
  cardId?: string;
  options?: string[];
  onGrade?: (rating: StudyRating) => boolean | Promise<boolean>;
};

const FACE_BODY_SX = {
  overflowX: "hidden",
  overflowY: "auto",
  overscrollBehavior: "contain",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  width: "100%",
  // Never show a focus ring on the scrollport (Study focuses the answer text instead).
  outline: "none",
  boxShadow: "none",
  WebkitTapHighlightColor: "transparent",
  "&:focus": { outline: "none" },
  "&:focus-visible": { outline: "none" },
} as const;

const PROMPT_SX = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  minHeight: 0,
} as const;

function faceMotionSx(revealedFace: boolean, thisFaceVisible: boolean) {
  return {
    ...FACE_SX,
    height: "100%",
    backfaceVisibility: "hidden" as const,
    WebkitBackfaceVisibility: "hidden" as const,
    position: "absolute" as const,
    inset: 0,
    ...(revealedFace ? { transform: "rotateY(180deg)" } : {}),
    "@media (prefers-reduced-motion: reduce)": {
      transform: "none",
      transition: "none",
      opacity: thisFaceVisible ? 1 : 0,
      visibility: thisFaceVisible ? "visible" : "hidden",
      pointerEvents: thisFaceVisible ? "auto" : "none",
      position: thisFaceVisible ? "relative" : "absolute",
      inset: thisFaceVisible ? "auto" : 0,
      width: "100%",
      height: thisFaceVisible ? "auto" : undefined,
      minHeight: thisFaceVisible ? 280 : undefined,
    },
  };
}

function FaceOverline({ label }: { label: string }) {
  return (
    <Box sx={{ mb: 2, flexShrink: 0 }}>
      <Typography component="div" sx={OVERLINE_SX}>
        {label}
      </Typography>
    </Box>
  );
}

const MEDIA_IMG_SX = {
  display: "block",
  width: "100%",
  maxHeight: "36%",
  objectFit: "contain" as const,
  mb: 2,
  borderRadius: 1,
  userSelect: "none" as const,
};

/** Hide_one stage: editor contract (scroll shell + natural-aspect img, no contain letterbox). */
function StudyMedia({
  imageKey,
  mask,
  masked,
}: {
  imageKey: string;
  mask?: OcclusionMaskBox;
  masked: boolean;
}) {
  if (mask) {
    return (
      <Box
        sx={{
          maxHeight: "42vh",
          overflow: "auto",
          width: "100%",
          mb: 2,
          borderRadius: 1,
        }}
      >
        <Box
          sx={{
            position: "relative",
            width: "100%",
            lineHeight: 0,
          }}
        >
          <Box
            component="img"
            src={mediaUrl(imageKey)}
            alt="Card media"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            sx={{
              display: "block",
              width: "100%",
              height: "auto",
              userSelect: "none",
            }}
          />
          <Box
            aria-hidden
            {...(masked
              ? { "data-occlusion-mask": true }
              : { "data-occlusion-reveal-outline": true })}
            sx={{
              position: "absolute",
              left: `${mask.x * 100}%`,
              top: `${mask.y * 100}%`,
              width: `${mask.w * 100}%`,
              height: `${mask.h * 100}%`,
              borderRadius: "4px",
              pointerEvents: "none",
              ...(masked
                ? {
                    bgcolor:
                      "color-mix(in srgb, var(--sp-stage-bg) 92%, transparent)",
                    border: "1.5px solid",
                    borderColor: "secondary.main",
                    boxShadow: "0 2px 12px var(--sp-lamp-glow)",
                  }
                : {
                    border: "1.5px solid",
                    borderColor: "secondary.main",
                    opacity: 0.85,
                    boxShadow:
                      "0 0 0 1px color-mix(in srgb, var(--sp-stage-bg) 35%, transparent)",
                  }),
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      component="img"
      src={mediaUrl(imageKey)}
      alt="Card media"
      draggable={false}
      onDragStart={(event) => event.preventDefault()}
      sx={MEDIA_IMG_SX}
    />
  );
}

/** Physical study card: 3D Y-flip, or instant swap when prefers-reduced-motion. */
export default function CardFace({
  front,
  back,
  type,
  revealed,
  onReveal,
  onFlipBack,
  disabled,
  mediaR2Keys = [],
  occlusion,
  answerFocusRef,
  showAnswerRef,
  cardId,
  options,
  onGrade,
}: Props) {
  const isMcq = type === "mcq";
  const isCloze = type === "cloze";
  const questionFront = isCloze ? blankClozeFront(front) : front;
  const clozeExtra = isCloze ? clozeExtraSubtitle(back) : null;
  const answerText = isCloze ? (extractClozeAnswer(front) ?? "") : back;
  const imageKey = occlusion?.imageKey ?? mediaR2Keys[0];
  const canReveal = !isMcq && !revealed && !disabled;
  const canFlipBack = !isMcq && revealed && !disabled;

  const reveal = () => {
    if (!canReveal) return;
    onReveal();
  };

  const flipBack = () => {
    if (!canFlipBack) return;
    onFlipBack();
  };

  const onShowAnswerClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    reveal();
  };

  const onShowQuestionClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    flipBack();
  };

  return (
    <Box
      sx={{
        ...CARD_COLUMN_SX,
        perspective: isMcq ? undefined : "1000px",
        maxHeight: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        className="sp-playing-card"
        onClick={
          isMcq
            ? undefined
            : canReveal
              ? reveal
              : canFlipBack
                ? flipBack
                : undefined
        }
        sx={{
          position: "relative",
          width: "auto",
          maxWidth: "min(100%, 360px)",
          maxHeight: "100%",
          height: "min(100%, 504px)",
          aspectRatio: "var(--sp-card-aspect)",
          borderRadius: 2,
          bgcolor: "transparent",
          transformStyle: isMcq ? undefined : "preserve-3d",
          transition: isMcq ? undefined : "transform 0.45s ease",
          transform: isMcq
            ? "none"
            : revealed
              ? "rotateY(180deg)"
              : "rotateY(0deg)",
          cursor: isMcq
            ? "default"
            : canReveal || canFlipBack
              ? "pointer"
              : "default",
          ...(!isMcq
            ? {
                "@media (prefers-reduced-motion: reduce)": {
                  transform: "none",
                  transition: "none",
                  minHeight: 280,
                  maxHeight: "100%",
                },
              }
            : {}),
        }}
      >
        {isMcq && cardId && onGrade ? (
          <CardFaceMcqBody
            cardId={cardId}
            front={front}
            back={back}
            options={options}
            disabled={disabled}
            onGrade={onGrade}
          />
        ) : null}
        {!isMcq ? (
          <>
        <Paper
          elevation={0}
          aria-hidden={revealed}
          inert={revealed || undefined}
          className="sp-playing-card"
          sx={faceMotionSx(false, !revealed)}
        >
          <FaceOverline label="Front" />
          <Box data-card-face-content sx={FACE_BODY_SX}>
            <Box sx={PROMPT_SX}>
              {imageKey ? (
                <StudyMedia
                  imageKey={imageKey}
                  mask={occlusion?.mask}
                  masked={!!occlusion}
                />
              ) : null}
              {questionFront ? (
                <Typography
                  component="p"
                  sx={{
                    fontFamily: FACE_SANS,
                    fontSize: { xs: "1.125rem", sm: "1.35rem" },
                    fontWeight: 400,
                    lineHeight: 1.35,
                    whiteSpace: "pre-wrap",
                    color: "inherit",
                  }}
                >
                  {questionFront}
                </Typography>
              ) : null}
            </Box>
            {!revealed ? (
              <Box sx={{ pt: 2, width: "100%", flexShrink: 0 }}>
                <Button
                  ref={showAnswerRef}
                  variant="contained"
                  onClick={onShowAnswerClick}
                  disabled={!!disabled}
                  sx={{ fontFamily: FACE_SANS, minHeight: 44 }}
                >
                  Show answer
                </Button>
              </Box>
            ) : null}
          </Box>
        </Paper>

        <Paper
          elevation={0}
          aria-hidden={!revealed}
          inert={!revealed || undefined}
          className="sp-playing-card"
          sx={faceMotionSx(true, revealed)}
        >
          <FaceOverline label="Back" />
          <Box data-card-face-content sx={FACE_BODY_SX}>
            {occlusion && imageKey ? (
              <StudyMedia
                imageKey={imageKey}
                mask={occlusion.mask}
                masked={false}
              />
            ) : !isCloze && front ? (
              <Typography
                component="p"
                sx={{
                  fontFamily: FACE_SANS,
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  lineHeight: 1.35,
                  whiteSpace: "pre-wrap",
                  color: "inherit",
                  opacity: 0.55,
                  textAlign: "center",
                  mb: 1.5,
                  flexShrink: 0,
                }}
              >
                {front}
              </Typography>
            ) : null}
            <Box
              ref={answerFocusRef}
              tabIndex={revealed ? -1 : undefined}
              sx={{
                ...PROMPT_SX,
                outline: "none",
                WebkitTapHighlightColor: "transparent",
                "&:focus": { outline: "none" },
                "&:focus-visible": { outline: "none" },
              }}
            >
              <Typography
                component="p"
                sx={{
                  fontFamily: FACE_SANS,
                  fontSize: { xs: "1.05rem", sm: "1.2rem" },
                  fontWeight: 400,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                  color: "inherit",
                }}
              >
                {answerText}
              </Typography>
              {clozeExtra ? (
                <Typography
                  component="p"
                  sx={{
                    fontFamily: FACE_SANS,
                    fontSize: "0.8125rem",
                    fontWeight: 400,
                    lineHeight: 1.4,
                    whiteSpace: "pre-wrap",
                    color: "inherit",
                    opacity: 0.6,
                    mt: 1.5,
                  }}
                >
                  {clozeExtra}
                </Typography>
              ) : null}
            </Box>
            {revealed ? (
              <Box sx={{ pt: 2, width: "100%", flexShrink: 0 }}>
                <Button
                  variant="outlined"
                  onClick={onShowQuestionClick}
                  disabled={!!disabled}
                  sx={{
                    fontFamily: FACE_SANS,
                    minHeight: 44,
                    borderColor: "currentColor",
                    color: "inherit",
                    opacity: 0.85,
                    "&:hover": {
                      borderColor: "currentColor",
                      bgcolor: "rgba(30, 13, 27, 0.06)",
                    },
                  }}
                >
                  Show question
                </Button>
              </Box>
            ) : null}
          </Box>
        </Paper>
          </>
        ) : null}
      </Box>
    </Box>
  );
}

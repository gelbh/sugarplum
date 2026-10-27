import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { MouseEvent, Ref } from "react";
import { mediaUrl } from "../api/client";
import { blankClozeFront, revealClozeFront } from "../lib/clozeFormat";

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
};

function displayClozeFront(front: string, revealed: boolean): string {
  return revealed ? revealClozeFront(front) : blankClozeFront(front);
}

const FACE_SANS = '"Source Sans 3", "Helvetica", "Arial", sans-serif';

const OVERLINE_SX = {
  fontFamily: FACE_SANS,
  fontSize: "0.6875rem",
  fontWeight: 500,
  letterSpacing: "0.22em",
  textTransform: "uppercase" as const,
  color: "inherit",
  opacity: 0.55,
  textAlign: "center" as const,
  lineHeight: 1.2,
};

const FACE_SX = {
  p: 3,
  height: "100%",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  borderRadius: 2,
  boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
  bgcolor: "var(--sp-card-face)",
  color: "var(--sp-stage-bg)",
  fontFamily: FACE_SANS,
} as const;

const FACE_BODY_SX = {
  overflowX: "hidden",
  overflowY: "auto",
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

/** Image with optional hide_one mask; stage matches editor (box = img bounds). */
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
          position: "relative",
          width: "100%",
          maxHeight: "42%",
          lineHeight: 0,
          mb: 2,
          borderRadius: 1,
          overflow: "hidden",
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
            maxHeight: "42vh",
            objectFit: "contain",
            userSelect: "none",
          }}
        />
        {masked ? (
          <Box
            aria-hidden
            data-occlusion-mask
            sx={{
              position: "absolute",
              left: `${mask.x * 100}%`,
              top: `${mask.y * 100}%`,
              width: `${mask.w * 100}%`,
              height: `${mask.h * 100}%`,
              bgcolor: "rgba(30, 13, 27, 0.92)",
              borderRadius: 0.5,
              pointerEvents: "none",
            }}
          />
        ) : null}
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
}: Props) {
  const questionFront =
    type === "cloze" ? displayClozeFront(front, false) : front;
  const answerFaceFront =
    type === "cloze" ? displayClozeFront(front, true) : front;
  const imageKey = occlusion?.imageKey ?? mediaR2Keys[0];
  const canReveal = !revealed && !disabled;
  const canFlipBack = revealed && !disabled;

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
        perspective: "1000px",
        width: "100%",
        maxWidth: 360,
        mx: "auto",
      }}
    >
      <Box
        className="sp-playing-card"
        onClick={canReveal ? reveal : canFlipBack ? flipBack : undefined}
        sx={{
          position: "relative",
          width: "100%",
          borderRadius: 2,
          bgcolor: "transparent",
          transformStyle: "preserve-3d",
          transition: "transform 0.45s ease",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
          cursor: canReveal || canFlipBack ? "pointer" : "default",
          "@media (prefers-reduced-motion: reduce)": {
            transform: "none",
            transition: "none",
            aspectRatio: "unset",
            minHeight: 280,
            maxHeight: "70vh",
          },
        }}
      >
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
            ) : answerFaceFront ? (
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
                {answerFaceFront}
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
                {back}
              </Typography>
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
      </Box>
    </Box>
  );
}

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { MouseEvent, Ref } from "react";
import { mediaUrl } from "../api/client";

type Props = {
  front: string;
  back: string;
  revealed: boolean;
  onReveal: () => void;
  disabled?: boolean;
  mediaR2Keys?: string[];
  /** Focus target for the answer face after reveal. */
  answerFocusRef?: Ref<HTMLElement | null>;
  /** Focus target for Show answer after grading to the next card. */
  showAnswerRef?: Ref<HTMLButtonElement | null>;
};

const FACE_SX = {
  p: 3,
  minHeight: 280,
  maxHeight: "70vh",
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  backfaceVisibility: "hidden",
  WebkitBackfaceVisibility: "hidden",
} as const;

const CONTENT_SX = {
  overflow: "auto",
  flex: 1,
  minHeight: 0,
} as const;

function faceMotionSx(revealedFace: boolean, thisFaceVisible: boolean) {
  return {
    ...FACE_SX,
    ...(revealedFace
      ? {
          position: "absolute" as const,
          inset: 0,
          transform: "rotateY(180deg)",
        }
      : { position: "relative" as const }),
    "@media (prefers-reduced-motion: reduce)": {
      transform: "none",
      transition: "none",
      opacity: thisFaceVisible ? 1 : 0,
      visibility: thisFaceVisible ? "visible" : "hidden",
      pointerEvents: thisFaceVisible ? "auto" : "none",
      position: thisFaceVisible ? "relative" : "absolute",
      inset: thisFaceVisible ? "auto" : 0,
      width: "100%",
    },
  };
}

/** Physical study card: 3D Y-flip, or instant swap when prefers-reduced-motion. */
export default function CardFace({
  front,
  back,
  revealed,
  onReveal,
  disabled,
  mediaR2Keys = [],
  answerFocusRef,
  showAnswerRef,
}: Props) {
  const imageKey = mediaR2Keys[0];
  const canReveal = !revealed && !disabled;

  const reveal = () => {
    if (!canReveal) return;
    onReveal();
  };

  const onShowAnswerClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    reveal();
  };

  return (
    <Box sx={{ perspective: "1000px" }}>
      <Box
        onClick={canReveal ? reveal : undefined}
        sx={{
          position: "relative",
          minHeight: 280,
          maxHeight: "70vh",
          transformStyle: "preserve-3d",
          transition: "transform 0.45s ease",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
          cursor: canReveal ? "pointer" : "default",
          "@media (prefers-reduced-motion: reduce)": {
            transform: "none",
            transition: "none",
          },
        }}
      >
        <Paper
          elevation={3}
          aria-hidden={revealed}
          inert={revealed || undefined}
          sx={faceMotionSx(false, !revealed)}
        >
          <Box data-card-face-content sx={CONTENT_SX}>
            {imageKey ? (
              <Box
                component="img"
                src={mediaUrl(imageKey)}
                alt="Card media"
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                sx={{
                  display: "block",
                  width: "100%",
                  maxHeight: "40vh",
                  objectFit: "contain",
                  mb: 2,
                  borderRadius: 1,
                  userSelect: "none",
                }}
              />
            ) : null}
            <Typography variant="overline" color="text.secondary">
              Front
            </Typography>
            <Typography
              variant="h5"
              component="p"
              sx={{ whiteSpace: "pre-wrap", mb: 2 }}
            >
              {front}
            </Typography>
            {!revealed ? (
              <Box sx={{ mt: 2 }}>
                <Button
                  ref={showAnswerRef}
                  variant="contained"
                  onClick={onShowAnswerClick}
                  disabled={!!disabled}
                >
                  Show answer
                </Button>
              </Box>
            ) : null}
          </Box>
        </Paper>

        <Paper
          elevation={3}
          aria-hidden={!revealed}
          inert={!revealed || undefined}
          sx={faceMotionSx(true, revealed)}
        >
          <Box
            ref={answerFocusRef}
            data-card-face-content
            tabIndex={revealed ? -1 : undefined}
            sx={{ ...CONTENT_SX, outline: "none" }}
          >
            <Typography variant="overline" color="text.secondary">
              Back
            </Typography>
            <Typography
              variant="body1"
              sx={{ whiteSpace: "pre-wrap", color: "secondary.main" }}
            >
              {back}
            </Typography>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

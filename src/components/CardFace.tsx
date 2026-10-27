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
  overflow: "auto",
  flex: 1,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
  width: "100%",
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
      <Box
        aria-hidden
        sx={{
          width: 28,
          height: 1,
          bgcolor: "currentColor",
          opacity: 0.35,
          mx: "auto",
          mt: 0.75,
        }}
      />
    </Box>
  );
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
        onClick={canReveal ? reveal : undefined}
        sx={{
          position: "relative",
          width: "100%",
          borderRadius: 2,
          bgcolor: "transparent",
          transformStyle: "preserve-3d",
          transition: "transform 0.45s ease",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
          cursor: canReveal ? "pointer" : "default",
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
                <Box
                  component="img"
                  src={mediaUrl(imageKey)}
                  alt="Card media"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  sx={{
                    display: "block",
                    width: "100%",
                    maxHeight: "36%",
                    objectFit: "contain",
                    mb: 2,
                    borderRadius: 1,
                    userSelect: "none",
                  }}
                />
              ) : null}
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
                {front}
              </Typography>
            </Box>
            {!revealed ? (
              <Box sx={{ pt: 2, width: "100%", flexShrink: 0 }}>
                <Button
                  ref={showAnswerRef}
                  variant="contained"
                  onClick={onShowAnswerClick}
                  disabled={!!disabled}
                  sx={{ fontFamily: FACE_SANS }}
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
          <Box
            ref={answerFocusRef}
            data-card-face-content
            tabIndex={revealed ? -1 : undefined}
            sx={{ ...FACE_BODY_SX, outline: "none" }}
          >
            <Box sx={PROMPT_SX}>
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
          </Box>
        </Paper>
      </Box>
    </Box>
  );
}

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";
import type { KeyboardEvent, MouseEvent } from "react";
import { mediaUrl } from "../api/client";

type Props = {
  front: string;
  back: string;
  revealed: boolean;
  onReveal: () => void;
  disabled?: boolean;
  mediaR2Keys?: string[];
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

/** Physical study card: 3D Y-flip, or crossfade when prefers-reduced-motion. */
export default function CardFace({
  front,
  back,
  revealed,
  onReveal,
  disabled,
  mediaR2Keys = [],
}: Props) {
  const imageKey = mediaR2Keys[0];
  const canReveal = !revealed && !disabled;

  const reveal = () => {
    if (!canReveal) return;
    onReveal();
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canReveal) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onReveal();
    }
  };

  const onShowAnswerClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    reveal();
  };

  return (
    <Box sx={{ perspective: "1000px" }}>
      <Box
        role={canReveal ? "button" : undefined}
        tabIndex={canReveal ? 0 : undefined}
        aria-label={canReveal ? "Show answer" : undefined}
        onClick={canReveal ? reveal : undefined}
        onKeyDown={canReveal ? onCardKeyDown : undefined}
        sx={{
          position: "relative",
          minHeight: 280,
          maxHeight: "70vh",
          transformStyle: "preserve-3d",
          transition: "transform 0.45s ease",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
          cursor: canReveal ? "pointer" : "default",
          outline: "none",
          "&:focus-visible": {
            boxShadow: (theme) => `0 0 0 3px ${theme.palette.primary.main}`,
            borderRadius: 1,
          },
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
          sx={{
            ...FACE_SX,
            position: "relative",
            "@media (prefers-reduced-motion: reduce)": {
              transition: "opacity 0.2s ease",
              opacity: revealed ? 0 : 1,
              visibility: revealed ? "hidden" : "visible",
              pointerEvents: revealed ? "none" : "auto",
              position: revealed ? "absolute" : "relative",
              inset: revealed ? 0 : "auto",
              width: "100%",
            },
          }}
        >
          <Box sx={CONTENT_SX}>
            {imageKey ? (
              <Box
                component="img"
                src={mediaUrl(imageKey)}
                alt="Card media"
                sx={{
                  display: "block",
                  width: "100%",
                  maxHeight: "40vh",
                  objectFit: "contain",
                  mb: 2,
                  borderRadius: 1,
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
            {canReveal ? (
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={onShowAnswerClick}
                  disabled={disabled}
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
          sx={{
            ...FACE_SX,
            position: "absolute",
            inset: 0,
            transform: "rotateY(180deg)",
            "@media (prefers-reduced-motion: reduce)": {
              transform: "none",
              transition: "opacity 0.2s ease",
              opacity: revealed ? 1 : 0,
              visibility: revealed ? "visible" : "hidden",
              pointerEvents: revealed ? "auto" : "none",
              position: revealed ? "relative" : "absolute",
              inset: revealed ? "auto" : 0,
            },
          }}
        >
          <Box sx={CONTENT_SX}>
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

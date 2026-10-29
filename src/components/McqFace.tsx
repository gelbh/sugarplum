import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useRef, useState } from "react";
import type { StudyRating } from "../api/client";
import {
  mcqOptionButtonDisabled,
  mcqTapRating,
  shuffledMcqOptions,
} from "../study/mcqStudy";
import { CARD_COLUMN_SX, FACE_SANS, FACE_SX, OVERLINE_SX } from "./studyFaceSx";

const FEEDBACK_MS = 650;

type Props = {
  cardId: string;
  front: string;
  back: string;
  options?: string[];
  disabled?: boolean;
  /** Return false (or reject) so the face unlocks for another tap. */
  onGrade: (rating: StudyRating) => boolean | Promise<boolean>;
};

export default function McqFace({
  cardId,
  front,
  back,
  options,
  disabled,
  onGrade,
}: Props) {
  const choices = useMemo(
    () => (options?.length ? shuffledMcqOptions(cardId, options) : []),
    [cardId, options],
  );
  const [picked, setPicked] = useState<string | null>(null);
  const gradeSentRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setPicked(null);
    gradeSentRef.current = false;
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cardId]);

  const unlock = () => {
    setPicked(null);
    gradeSentRef.current = false;
  };

  const onPick = (option: string) => {
    if (disabled || picked !== null || gradeSentRef.current) return;
    setPicked(option);
    gradeSentRef.current = true;
    const rating = mcqTapRating(option, back);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        try {
          const ok = await onGrade(rating);
          if (!ok) unlock();
        } catch {
          unlock();
        }
      })();
    }, FEEDBACK_MS);
  };

  return (
    <Box sx={CARD_COLUMN_SX}>
      <Paper
        elevation={0}
        className="sp-playing-card"
        sx={{
          ...FACE_SX,
          minHeight: 280,
          maxHeight: "70vh",
        }}
      >
        <Typography
          component="div"
          sx={{ ...OVERLINE_SX, mb: 2, flexShrink: 0 }}
        >
          Front
        </Typography>
        <Box
          data-card-face-content
          sx={{
            overflowX: "hidden",
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            width: "100%",
            outline: "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <Typography
            component="p"
            sx={{
              fontFamily: FACE_SANS,
              fontSize: { xs: "1.125rem", sm: "1.35rem" },
              fontWeight: 400,
              lineHeight: 1.35,
              whiteSpace: "pre-wrap",
              textAlign: "center",
              mb: 2,
              flexShrink: 0,
            }}
          >
            {front}
          </Typography>
          {choices.length === 0 ? (
            <Typography
              variant="body2"
              sx={{ textAlign: "center", opacity: 0.7 }}
            >
              No choices on this card.
            </Typography>
          ) : (
            <Stack spacing={1} sx={{ width: "100%", mt: "auto" }}>
              {choices.map((option, index) => {
                const isPicked = picked === option;
                const isCorrect = option.trim() === back.trim();
                const locked = picked !== null;
                // Dual-register on ivory: plum = correct, amber lamp = wrong pick (no traffic-light hex).
                let borderColor = "currentColor";
                let bgcolor = "transparent";
                let opacity = 0.88;
                if (locked) {
                  if (isCorrect) {
                    borderColor = "#5B2C6F";
                    bgcolor = "rgba(91, 44, 111, 0.16)";
                    opacity = 1;
                  } else if (isPicked) {
                    borderColor = "#C4A574";
                    bgcolor = "rgba(196, 165, 116, 0.22)";
                    opacity = 1;
                  } else {
                    opacity = 0.45;
                  }
                }
                return (
                  <Button
                    key={`${index}-${option}`}
                    fullWidth
                    disabled={mcqOptionButtonDisabled(disabled, locked)}
                    aria-disabled={disabled || locked}
                    tabIndex={locked ? -1 : undefined}
                    onClick={() => onPick(option)}
                    sx={{
                      justifyContent: "flex-start",
                      textAlign: "left",
                      py: 1.25,
                      px: 1.5,
                      borderRadius: 1,
                      color: "inherit",
                      bgcolor,
                      border: "1px solid",
                      borderColor,
                      opacity,
                      pointerEvents: disabled || locked ? "none" : "auto",
                      textTransform: "none",
                      fontFamily: FACE_SANS,
                      fontSize: "0.9375rem",
                      lineHeight: 1.35,
                      whiteSpace: "pre-wrap",
                      "&:hover": {
                        bgcolor:
                          picked === null
                            ? "color-mix(in srgb, currentColor 10%, transparent)"
                            : bgcolor,
                      },
                      "&.Mui-disabled": {
                        color: "inherit",
                        borderColor,
                        bgcolor,
                        opacity,
                      },
                    }}
                  >
                    {option}
                  </Button>
                );
              })}
            </Stack>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

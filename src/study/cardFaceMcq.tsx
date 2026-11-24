import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { StudyRating } from "../api/client";
import {
  mcqOptionButtonDisabled,
  mcqSetRating,
  mcqTapRating,
  parseMcqAnswers,
  shuffledMcqOptions,
} from "./mcqStudy";
import {
  mcqOptionIndexForKey,
  mcqOptionKey,
  plainShortcutKey,
} from "./studyKeys";
import { FaceOverline } from "./faceOverline";
import KeyChip from "./KeyChip";
import { FACE_SANS, FACE_SX } from "./studyFaceSx";

const FEEDBACK_MS = 650;

type Props = {
  cardId: string;
  front: string;
  back: string;
  options?: string[];
  disabled?: boolean;
  /**
   * Author preview: keep option order, no keyboard/grade taps.
   * Looks like the idle study face.
   */
  preview?: boolean;
  /** Return false (or reject) so the face unlocks for another tap. */
  onGrade?: (rating: StudyRating) => boolean | Promise<boolean>;
  overlineTrailing?: ReactNode;
};

/** MCQ interior for the shared CardFace plate (no own column / aspect shell). */
export function CardFaceMcqBody({
  cardId,
  front,
  back,
  options,
  disabled,
  preview = false,
  onGrade,
  overlineTrailing,
}: Props) {
  const choices = useMemo(
    () =>
      options?.length
        ? preview
          ? [...options]
          : shuffledMcqOptions(cardId, options)
        : [],
    [cardId, options, preview],
  );
  const correctAnswers = useMemo(
    () => parseMcqAnswers(back, options ?? []),
    [back, options],
  );
  const multi = correctAnswers.length > 1;
  const correctSet = useMemo(
    () => new Set(correctAnswers.map((a) => a.trim())),
    [correctAnswers],
  );

  const [picked, setPicked] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const gradeSentRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setPicked(null);
    setSelected([]);
    setChecked(false);
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
    setSelected([]);
    setChecked(false);
    gradeSentRef.current = false;
  };

  const finishGrade = (rating: StudyRating) => {
    gradeSentRef.current = true;
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        try {
          const ok = await onGrade?.(rating);
          if (!ok) unlock();
        } catch {
          unlock();
        }
      })();
    }, FEEDBACK_MS);
  };

  const onPickSingle = (option: string) => {
    if (
      preview ||
      !onGrade ||
      disabled ||
      picked !== null ||
      gradeSentRef.current
    )
      return;
    setPicked(option);
    finishGrade(mcqTapRating(option, back));
  };

  const onToggleMulti = (option: string) => {
    if (preview || disabled || checked || gradeSentRef.current) return;
    setSelected((prev) =>
      prev.includes(option)
        ? prev.filter((value) => value !== option)
        : [...prev, option],
    );
  };

  const onCheckMulti = () => {
    if (
      preview ||
      !onGrade ||
      disabled ||
      checked ||
      gradeSentRef.current ||
      selected.length === 0
    )
      return;
    setChecked(true);
    finishGrade(mcqSetRating(selected, correctAnswers));
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (preview) return;
    const key = plainShortcutKey(e);
    if (key === null) return;
    if (multi) {
      if (key === " " || key === "Enter") {
        if (checked) return;
        e.preventDefault();
        onCheckMulti();
        return;
      }
    }
    const index = mcqOptionIndexForKey(key, choices.length);
    if (index === null) return;
    e.preventDefault();
    const option = choices[index];
    if (!option) return;
    if (multi) onToggleMulti(option);
    else onPickSingle(option);
  });

  useEffect(() => {
    if (preview) return;
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const locked = multi
    ? !preview && checked
    : !preview && picked !== null;

  return (
    <Paper
      elevation={0}
      className="sp-playing-card"
      sx={{
        ...FACE_SX,
        height: "100%",
      }}
    >
      <FaceOverline label="Front" trailing={overlineTrailing} />
      <Box
        data-card-face-content
        sx={{
          overflowX: "hidden",
          // Preview tiles (browse/editor) must not trap workshop scroll.
          overflowY: preview ? "hidden" : "auto",
          overscrollBehavior: preview ? "auto" : "contain",
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
            overflowWrap: "anywhere",
            wordBreak: "break-word",
            maxWidth: "100%",
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
              const isPicked = multi
                ? selected.includes(option)
                : !preview && picked === option;
              const isCorrect = correctSet.has(option.trim());
              const shortcut = mcqOptionKey(index);
              let borderColor = "currentColor";
              let bgcolor = "transparent";
              let opacity = 0.88;
              if (multi && !locked && isPicked) {
                borderColor = "#5B2C6F";
                bgcolor = "rgba(91, 44, 111, 0.12)";
                opacity = 1;
              }
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
                  disabled={
                    preview ? true : mcqOptionButtonDisabled(disabled, locked)
                  }
                  aria-disabled={preview || disabled || locked}
                  aria-pressed={multi ? isPicked : undefined}
                  tabIndex={preview || locked ? -1 : undefined}
                  aria-keyshortcuts={
                    preview ? undefined : (shortcut ?? undefined)
                  }
                  onClick={() =>
                    multi ? onToggleMulti(option) : onPickSingle(option)
                  }
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
                    pointerEvents:
                      preview || disabled || locked ? "none" : "auto",
                    textTransform: "none",
                    fontFamily: FACE_SANS,
                    fontSize: "0.9375rem",
                    lineHeight: 1.35,
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    "&:hover": {
                      bgcolor:
                        preview || locked
                          ? bgcolor
                          : "color-mix(in srgb, currentColor 10%, transparent)",
                    },
                    "&.Mui-disabled": {
                      color: "inherit",
                      borderColor,
                      bgcolor,
                      opacity: preview ? 0.88 : opacity,
                    },
                  }}
                >
                  <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
                    {option.trim() || `Choice ${index + 1}`}
                  </Box>
                  {!preview && shortcut ? (
                    <KeyChip label={shortcut} ml={1} />
                  ) : null}
                </Button>
              );
            })}
            {multi && !preview ? (
              <Button
                variant="contained"
                disabled={
                  disabled ||
                  locked ||
                  selected.length === 0 ||
                  gradeSentRef.current
                }
                onClick={onCheckMulti}
                aria-keyshortcuts="Space"
                sx={{
                  mt: 0.5,
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 999,
                  boxShadow: "none",
                  "&:hover": { boxShadow: "none" },
                }}
              >
                Check
                <KeyChip label="Space" ml={1} />
              </Button>
            ) : null}
          </Stack>
        )}
      </Box>
    </Paper>
  );
}

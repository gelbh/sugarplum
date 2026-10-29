import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { SvgIconComponent } from "@mui/icons-material";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import type { StudyRating } from "../api/client";

const FACE_SANS = '"Source Sans 3", "Helvetica", "Arial", sans-serif';

/** Icons mirror swipe directions (← Again · ↓ Hard · → Good · ↑ Easy). */
const GRADES: {
  rating: StudyRating;
  label: string;
  key: string;
  Icon: SvgIconComponent;
}[] = [
  { rating: 1, label: "Again", key: "1", Icon: ArrowBackRoundedIcon },
  { rating: 2, label: "Hard", key: "2", Icon: ArrowDownwardRoundedIcon },
  { rating: 3, label: "Good", key: "3", Icon: ArrowForwardRoundedIcon },
  { rating: 4, label: "Easy", key: "4", Icon: ArrowUpwardRoundedIcon },
];

type Props = {
  disabled?: boolean;
  onGrade: (rating: StudyRating) => void;
  showSwipeHint?: boolean;
};

/** FSRS grade rail: swipe-direction icons, key chips, ivory on stage. */
export default function GradeButtons({
  disabled,
  onGrade,
  showSwipeHint = false,
}: Props) {
  return (
    <Stack spacing={1.25} sx={{ width: "100%" }}>
      {showSwipeHint ? (
        <Typography
          variant="caption"
          sx={{
            textAlign: "center",
            fontFamily: FACE_SANS,
            letterSpacing: "0.04em",
            color: "inherit",
            opacity: 0.72,
          }}
        >
          Swipe: ← Again · → Good · ↓ Hard · ↑ Easy
        </Typography>
      ) : null}
      <Stack
        direction="row"
        spacing={0.75}
        useFlexGap
        sx={{ width: "100%", justifyContent: "space-between" }}
      >
        {GRADES.map((g) => {
          const { Icon } = g;
          return (
            <Button
              key={g.rating}
              fullWidth
              disableElevation
              disabled={disabled}
              onClick={() => onGrade(g.rating)}
              aria-keyshortcuts={g.key}
              aria-label={`${g.label} (key ${g.key})`}
              sx={{
                flex: 1,
                minHeight: 56,
                minWidth: 0,
                px: 0.5,
                py: 1,
                borderRadius: 1,
                color: "inherit",
                bgcolor: "transparent",
                border: "1px solid",
                borderColor: "currentColor",
                opacity: 0.88,
                transition:
                  "background-color 0.18s ease, opacity 0.18s ease, transform 0.12s ease",
                "&:hover": {
                  bgcolor: "color-mix(in srgb, currentColor 12%, transparent)",
                  opacity: 1,
                },
                "&:active": {
                  transform: "scale(0.97)",
                },
                "&.Mui-disabled": {
                  opacity: 0.35,
                  borderColor: "currentColor",
                },
                "&:focus-visible": {
                  outline: "2px solid",
                  outlineColor: "currentColor",
                  outlineOffset: 2,
                },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0.5,
                  width: "100%",
                }}
              >
                <Icon aria-hidden sx={{ fontSize: "1.35rem", opacity: 0.95 }} />
                <Typography
                  component="span"
                  sx={{
                    fontFamily: FACE_SANS,
                    fontSize: "0.8125rem",
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    lineHeight: 1.2,
                    textTransform: "none",
                  }}
                >
                  {g.label}
                </Typography>
                <Box
                  aria-hidden
                  component="span"
                  sx={{
                    display: { xs: "none", md: "inline-flex" },
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: "18px",
                    height: "16px",
                    px: "4px",
                    borderRadius: "3px",
                    border: "1px solid",
                    borderColor: "currentColor",
                    fontFamily: FACE_SANS,
                    fontSize: "0.625rem",
                    fontWeight: 500,
                    letterSpacing: "0.04em",
                    lineHeight: 1,
                    opacity: 0.65,
                  }}
                >
                  {g.key}
                </Box>
              </Box>
            </Button>
          );
        })}
      </Stack>
    </Stack>
  );
}

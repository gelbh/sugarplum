import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { StudyRating } from "../api/client";

const GRADES: { rating: StudyRating; label: string; key: string }[] = [
  { rating: 1, label: "Again", key: "1" },
  { rating: 2, label: "Hard", key: "2" },
  { rating: 3, label: "Good", key: "3" },
  { rating: 4, label: "Easy", key: "4" },
];

type Props = {
  disabled?: boolean;
  onGrade: (rating: StudyRating) => void;
  showSwipeHint?: boolean;
};

/** FSRS grade controls as dose-tick rail; desktop keys 1-4. */
export default function GradeButtons({
  disabled,
  onGrade,
  showSwipeHint = false,
}: Props) {
  return (
    <Stack spacing={1} sx={{ width: "100%" }}>
      <Typography
        variant="caption"
        sx={{
          textAlign: "center",
          letterSpacing: "0.04em",
          color: "inherit",
          opacity: 0.72,
        }}
      >
        {showSwipeHint
          ? "Swipe: ← Again · → Good · ↓ Hard · ↑ Easy"
          : "Grade (keys 1-4)"}
      </Typography>
      <Stack
        direction="row"
        spacing={0}
        useFlexGap
        sx={{ width: "100%", justifyContent: "space-between" }}
      >
        {GRADES.map((g) => (
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
              minHeight: 44,
              minWidth: 0,
              px: 0.5,
              py: 1,
              borderRadius: 1,
              color: "inherit",
              bgcolor: "transparent",
              "&:hover": {
                bgcolor: "action.hover",
              },
              "&.Mui-disabled": {
                opacity: 0.4,
              },
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.75,
                width: "100%",
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: 1.5,
                  height: 10,
                  borderRadius: 0.5,
                  bgcolor: "currentColor",
                  opacity: 0.85,
                }}
              />
              <Typography
                component="span"
                sx={{
                  fontFamily:
                    '"Source Sans 3", "Helvetica", "Arial", sans-serif',
                  fontSize: "0.8125rem",
                  fontWeight: 400,
                  letterSpacing: "0.02em",
                  lineHeight: 1.2,
                  textTransform: "none",
                }}
              >
                <Box
                  component="span"
                  sx={{ display: { xs: "none", md: "inline" } }}
                >
                  {g.key}{" "}
                </Box>
                {g.label}
              </Typography>
            </Box>
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

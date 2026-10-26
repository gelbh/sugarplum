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
};

/** FSRS grade controls; desktop keys 1-4. */
export default function GradeButtons({ disabled, onGrade }: Props) {
  return (
    <Stack spacing={1}>
      <Typography variant="caption" color="text.secondary">
        Grade (keys 1-4)
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {GRADES.map((g) => (
          <Button
            key={g.rating}
            variant={g.rating === 3 ? "contained" : "outlined"}
            color={g.rating === 1 ? "error" : "primary"}
            disabled={disabled}
            onClick={() => onGrade(g.rating)}
            aria-keyshortcuts={g.key}
          >
            {g.key} {g.label}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

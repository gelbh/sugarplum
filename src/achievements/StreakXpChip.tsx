import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { navigate } from "../nav/navigate";
import { useStudyChrome } from "../study/StudyChromeContext";

export type StreakXpChipProps = {
  streak: number;
  level: number;
};

/** Calm streak + level link into the achievements gallery. */
export default function StreakXpChip({ streak, level }: StreakXpChipProps) {
  const { hideChrome } = useStudyChrome();
  if (hideChrome) return null;

  const label = `Streak ${streak} · Lv ${level}`;

  return (
    <Chip
      label={
        <Box
          component="span"
          key={label}
          sx={{
            display: "inline-block",
            animation: "streakChipCrossfade 140ms ease",
            "@keyframes streakChipCrossfade": {
              from: { opacity: 0 },
              to: { opacity: 1 },
            },
            "@media (prefers-reduced-motion: reduce)": {
              animation: "none",
            },
          }}
        >
          {label}
        </Box>
      }
      size="small"
      variant="outlined"
      clickable
      onClick={() => navigate("/achievements")}
      sx={{
        maxWidth: "100%",
        borderColor: "rgba(232, 216, 199, 0.28)",
        color: "inherit",
        fontWeight: 500,
        letterSpacing: 0.2,
        "& .MuiChip-label": {
          px: 1,
        },
        "&:hover": {
          bgcolor: "rgba(245, 245, 245, 0.06)",
        },
      }}
    />
  );
}

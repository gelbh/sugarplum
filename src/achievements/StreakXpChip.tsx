import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { navigate } from "../nav/navigate";

export type StreakXpChipProps = {
  streak: number;
  level: number;
  /** Icon rail: short label that fits ~80px. */
  compact?: boolean;
};

export default function StreakXpChip({
  streak,
  level,
  compact = false,
}: StreakXpChipProps) {
  const fullLabel = `Streak ${streak} · Lv ${level}`;
  const label = compact ? `L${level}` : fullLabel;

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
      title={fullLabel}
      aria-label={fullLabel}
      onClick={() => navigate("/achievements")}
      sx={{
        maxWidth: "100%",
        minWidth: compact ? 40 : undefined,
        height: compact ? 28 : undefined,
        borderColor: "rgba(232, 216, 199, 0.28)",
        color: "inherit",
        fontWeight: 500,
        letterSpacing: 0.2,
        "& .MuiChip-label": {
          px: compact ? 0.75 : 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
        },
        "&:hover": {
          bgcolor: "rgba(245, 245, 245, 0.06)",
        },
      }}
    />
  );
}

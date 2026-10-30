import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import type { AchievementItemView, CompositePartView } from "../api/client";
import { RARITY_LABEL } from "./catalog";
import FruitMedal from "./FruitMedal";

const PART_LABEL: Record<CompositePartView["key"], string> = {
  streak_best: "Best streak",
  reviews: "Reviews",
};

function staggerDelay(unlockedIndex: number): string {
  return `${Math.min(unlockedIndex * 40, 240)}ms`;
}

function ProgressLine({
  label,
  current,
  target,
}: {
  label?: string;
  current: number;
  target: number;
}) {
  return (
    <Box sx={{ mt: 1 }}>
      <LinearProgress
        variant="determinate"
        value={target > 0 ? Math.min(100, (current / target) * 100) : 0}
        sx={{ height: 6, borderRadius: 1 }}
      />
      <Typography variant="caption" color="text.secondary">
        {label ? `${label} ` : ""}
        {current} / {target}
      </Typography>
    </Box>
  );
}

export default function AchievementRow({
  item,
  staggerIndex,
  sheenOnce,
}: {
  item: AchievementItemView;
  staggerIndex: number;
  sheenOnce: boolean;
}) {
  const unlocked = item.completedAt != null;
  const { progress } = item;
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        alignItems: "flex-start",
        opacity: unlocked ? 1 : 0.55,
        ...(unlocked
          ? {
              animation: `achievementStagger 420ms cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay(staggerIndex)} both`,
              "@media (prefers-reduced-motion: reduce)": {
                animation: "none",
                opacity: 1,
              },
            }
          : {}),
      }}
    >
      <FruitMedal
        fruitType={item.def.fruitType}
        traits={item.traits}
        size={48}
        locked={!unlocked}
        sheenOnce={sheenOnce}
      />
      <Box flex={1} minWidth={0}>
        <Typography variant="subtitle2" fontWeight={600}>
          {item.def.title}
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block">
          {RARITY_LABEL[item.def.rarity]} · {item.def.description}
        </Typography>
        {unlocked ? (
          <Typography
            variant="caption"
            color="success.main"
            display="block"
            sx={{ mt: 0.5 }}
          >
            Unlocked
          </Typography>
        ) : progress?.parts ? (
          progress.parts.map((part) => (
            <ProgressLine
              key={part.key}
              label={PART_LABEL[part.key]}
              current={part.current}
              target={part.target}
            />
          ))
        ) : progress ? (
          <ProgressLine
            current={progress.currentValue}
            target={progress.threshold}
          />
        ) : (
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 0.5 }}
          >
            Progress tracked automatically
          </Typography>
        )}
      </Box>
    </Box>
  );
}

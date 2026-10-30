import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Typography from "@mui/material/Typography";
import { RARITY_LABEL } from "./catalog";
import FruitMedal from "./FruitMedal";
import type {
  AchievementItem,
  AchievementProgress,
  CompositePart,
} from "./wire";

const PART_LABEL: Record<CompositePart["key"], string> = {
  streak_best: "Best streak",
  reviews: "Reviews",
};

function staggerDelay(unlockedIndex: number): string {
  return `${Math.min(unlockedIndex * 40, 240)}ms`;
}

const NEAR_COMPLETE_RATIO = 0.8;

type RowState = "unlocked" | "near" | "locked";

const ROW_OPACITY: Record<RowState, number> = {
  unlocked: 1,
  near: 0.8,
  locked: 0.55,
};

function rowState(item: AchievementItem): RowState {
  if (item.completedAt != null) return "unlocked";
  const { progress } = item;
  const near =
    progress?.kind === "composite" &&
    progress.parts.length > 0 &&
    progress.parts.every(
      (p) => p.target > 0 && p.current / p.target >= NEAR_COMPLETE_RATIO,
    );
  return near ? "near" : "locked";
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

function StatusCaption({
  color,
  children,
}: {
  color: string;
  children: string;
}) {
  return (
    <Typography
      variant="caption"
      color={color}
      display="block"
      sx={{ mt: 0.5 }}
    >
      {children}
    </Typography>
  );
}

function RowStatus({
  state,
  progress,
}: {
  state: RowState;
  progress: AchievementProgress;
}) {
  if (state === "unlocked") {
    return <StatusCaption color="success.main">Unlocked</StatusCaption>;
  }
  if (!progress) {
    return (
      <StatusCaption color="text.secondary">
        Progress tracked automatically
      </StatusCaption>
    );
  }
  switch (progress.kind) {
    case "count":
      return (
        <ProgressLine
          current={progress.currentValue}
          target={progress.threshold}
        />
      );
    case "composite":
      return (
        <>
          {progress.parts.map((part) => (
            <ProgressLine
              key={part.key}
              label={PART_LABEL[part.key]}
              current={part.current}
              target={part.target}
            />
          ))}
          {state === "near" ? (
            <StatusCaption color="primary.main">Almost there</StatusCaption>
          ) : null}
        </>
      );
    default: {
      const unhandled: never = progress;
      void unhandled;
      return null;
    }
  }
}

export default function AchievementRow({
  item,
  staggerIndex,
  sheenOnce,
}: {
  item: AchievementItem;
  staggerIndex: number;
  sheenOnce: boolean;
}) {
  const state = rowState(item);
  const unlocked = state === "unlocked";
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1.5,
        alignItems: "flex-start",
        opacity: ROW_OPACITY[state],
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
        <RowStatus state={state} progress={item.progress} />
      </Box>
    </Box>
  );
}

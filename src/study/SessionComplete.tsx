import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { GAMIFICATION_CHANGED_EVENT, getGamification } from "../api/client";
import FruitMedal from "../achievements/FruitMedal";
import type { UnlockView } from "../achievements/wire";
import { gradeLabelMultiline } from "./gradeLabels";
import { gradedTotal, type GradeTally } from "./sessionTally";

const GRADES = [
  { key: "again", rating: 1 as const },
  { key: "hard", rating: 2 as const },
  { key: "good", rating: 3 as const },
  { key: "easy", rating: 4 as const },
] as const;

export type SessionCompleteProps = {
  zen: boolean;
  tally: GradeTally;
  unlocks: readonly UnlockView[];
  showAchievements: boolean;
  canStudyMore: boolean;
  studyMoreBusy: boolean;
  onStudyMore: () => void;
  onToday: () => void;
  onAchievements: () => void;
  scopeBack: { href: string; label: string; onClick: () => void } | null;
};

export default function SessionComplete(props: SessionCompleteProps) {
  const reviewed = gradedTotal(props.tally);
  const ink = props.zen ? "var(--sp-ivory)" : "text.primary";
  const [streak, setStreak] = useState<{
    current: number;
    level: number;
  } | null>(null);

  useEffect(() => {
    if (!props.showAchievements) return;
    let cancelled = false;
    let latest = 0;
    const load = () => {
      const req = ++latest;
      void getGamification()
        .then((g) => {
          if (!cancelled && req === latest) {
            setStreak({ current: g.streakCurrent, level: g.level });
          }
        })
        .catch(() => {
          if (!cancelled && req === latest) setStreak(null);
        });
    };
    load();
    window.addEventListener(GAMIFICATION_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(GAMIFICATION_CHANGED_EVENT, load);
    };
  }, [props.showAchievements]);
  const body = (
    <Stack
      spacing={2}
      sx={{
        "@keyframes sessionCompleteIn": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        "@media (prefers-reduced-motion: reduce)": {
          "@keyframes sessionCompleteIn": {
            from: { opacity: 0 },
            to: { opacity: 1 },
          },
        },
      }}
    >
      <Typography
        variant="h4"
        component="h1"
        sx={{
          fontWeight: 600,
          color: props.zen ? "var(--sp-ivory)" : "primary.main",
          animation: "sessionCompleteIn 400ms cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        Caught up for now
      </Typography>
      <Typography variant="body1" sx={{ color: ink }}>
        {reviewed} reviewed
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 1,
        }}
      >
        {GRADES.map((grade) => (
          <Box
            key={grade.key}
            sx={{
              textAlign: "center",
              py: 1,
              borderRadius: "4px",
              bgcolor: `var(--sp-grade-${grade.key}-wash)`,
              border: "1px solid",
              borderColor: `var(--sp-grade-${grade.key}-border)`,
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontFamily: "inherit",
                fontVariantNumeric: "tabular-nums",
                color: ink,
              }}
            >
              {props.tally[grade.key]}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: `var(--sp-grade-${grade.key}-border)`,
                display: "block",
                whiteSpace: "pre-line",
                lineHeight: 1.2,
              }}
            >
              {gradeLabelMultiline(grade.rating)}
            </Typography>
          </Box>
        ))}
      </Box>
      {props.showAchievements && props.unlocks.length > 0 ? (
        <Box>
          <Typography variant="caption" sx={{ color: ink, opacity: 0.7 }}>
            New medals
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
            {props.unlocks.map((unlock) => (
              <FruitMedal
                key={unlock.id}
                fruitType={unlock.fruitType}
                traits={unlock.traits}
                size={56}
                sheenOnce
              />
            ))}
          </Stack>
        </Box>
      ) : null}
      {streak ? (
        <Typography variant="body2" sx={{ color: ink }}>
          Streak {streak.current} · Level {streak.level}
        </Typography>
      ) : null}
      <Stack spacing={1}>
        {props.canStudyMore ? (
          <Button
            variant="contained"
            disabled={props.studyMoreBusy}
            onClick={props.onStudyMore}
          >
            {props.studyMoreBusy ? "Loading…" : "Study more"}
          </Button>
        ) : null}
        <Button
          variant={props.canStudyMore ? "outlined" : "contained"}
          onClick={props.onToday}
          sx={
            props.zen && props.canStudyMore
              ? {
                  color: "var(--sp-ivory)",
                  borderColor: "var(--sp-ivory)",
                  "&:hover": { borderColor: "var(--sp-ivory)" },
                }
              : undefined
          }
        >
          Today
        </Button>
        {props.showAchievements ? (
          <Link
            href="/achievements"
            underline="hover"
            onClick={(ev) => {
              ev.preventDefault();
              props.onAchievements();
            }}
            sx={props.zen ? { color: "var(--sp-ivory)" } : undefined}
          >
            Achievements
          </Link>
        ) : null}
        {props.scopeBack ? (
          <Link
            href={props.scopeBack.href}
            underline="hover"
            onClick={(ev) => {
              ev.preventDefault();
              props.scopeBack?.onClick();
            }}
            sx={props.zen ? { color: "var(--sp-ivory)" } : undefined}
          >
            {props.scopeBack.label}
          </Link>
        ) : null}
      </Stack>
    </Stack>
  );

  if (!props.zen) {
    return (
      <Paper variant="outlined" sx={{ p: 2.5 }}>
        {body}
      </Paper>
    );
  }
  return body;
}

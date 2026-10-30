import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AchievementRow from "../achievements/AchievementRow";
import {
  FRUIT_LABEL,
  FRUIT_ORDER,
  type FruitType,
} from "../achievements/catalog";
import MagnificCredits from "../achievements/MagnificCredits";
import { useAchievementsData } from "../achievements/useAchievementsData";
import type { AchievementItem } from "../achievements/wire";

const SHEEN_SEEN_KEY = "sugarplum:achievement-sheen-seen";

function sheenSeenIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SHEEN_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(parsed);
  } catch {
    return new Set();
  }
}

function markSheenSeen(id: string) {
  const set = sheenSeenIds();
  set.add(id);
  try {
    sessionStorage.setItem(SHEEN_SEEN_KEY, JSON.stringify([...set]));
  } catch {
    // Storage blocked or full: the sheen may replay, which is harmless.
  }
}

function groupByFruit(
  items: AchievementItem[],
): Map<FruitType, AchievementItem[]> {
  const map = new Map<FruitType, AchievementItem[]>();
  for (const fruit of FRUIT_ORDER) {
    map.set(fruit, []);
  }
  for (const item of items) {
    map.get(item.def.fruitType)?.push(item);
  }
  for (const [, list] of map) {
    list.sort((a, b) => a.def.sortOrder - b.def.sortOrder);
  }
  return map;
}

export default function AchievementsPage() {
  const { ready, guest, error, items, gamification, board } =
    useAchievementsData();
  const [sheenOnceIds, setSheenOnceIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (items.length === 0) return;
    const seen = sheenSeenIds();
    const pending = new Set<string>();
    for (const item of items) {
      if (
        item.completedAt &&
        item.def.rarity === "legendary" &&
        !seen.has(item.def.id)
      ) {
        pending.add(item.def.id);
      }
    }
    if (pending.size === 0) return;
    setSheenOnceIds(pending);
    const t = window.setTimeout(() => {
      for (const id of pending) markSheenSeen(id);
    }, 1000);
    return () => window.clearTimeout(t);
  }, [items]);

  const grouped = useMemo(() => groupByFruit(items), [items]);
  const staggerIndexById = useMemo(() => {
    const out = new Map<string, number>();
    for (const fruit of FRUIT_ORDER) {
      for (const item of grouped.get(fruit) ?? []) {
        if (item.completedAt != null) out.set(item.def.id, out.size);
      }
    }
    return out;
  }, [grouped]);

  if (!ready) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Typography color="text.secondary">Loading achievements…</Typography>
      </Container>
    );
  }

  if (guest) {
    return (
      <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
        <Stack spacing={2}>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
            Achievements
          </Typography>
          <Alert severity="info">
            Sign in to track streaks, XP, and fruit medals. Guest study stays on
            this device only.
          </Alert>
          <Button variant="contained" href="/login">
            Sign in
          </Button>
          <MagnificCredits />
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
      <Stack
        spacing={3}
        sx={{
          "@keyframes achievementStagger": {
            from: { opacity: 0, transform: "translateY(6px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
        }}
      >
        <Box>
          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ color: "text.primary", fontWeight: 600 }}
          >
            Achievements
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Collect fruit medals as you study, accept cards, and keep your
            streak alive.
          </Typography>
          {gamification ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Streak {gamification.streakCurrent} (best{" "}
              {gamification.streakBest}) · Level {gamification.level} ·{" "}
              {gamification.xpTotal} XP
            </Typography>
          ) : null}
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {!error
          ? FRUIT_ORDER.map((fruit) => {
              const list = grouped.get(fruit) ?? [];
              if (list.length === 0) return null;
              return (
                <Paper
                  key={fruit}
                  variant="outlined"
                  sx={{
                    p: 2.5,
                    bgcolor: "background.paper",
                    borderColor: "divider",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    component="h2"
                    sx={{ fontWeight: 600, mb: 2, color: "primary.main" }}
                  >
                    {FRUIT_LABEL[fruit]}
                  </Typography>
                  <Stack spacing={2}>
                    {list.map((item) => (
                      <AchievementRow
                        key={item.def.id}
                        item={item}
                        staggerIndex={staggerIndexById.get(item.def.id) ?? 0}
                        sheenOnce={sheenOnceIds.has(item.def.id)}
                      />
                    ))}
                  </Stack>
                </Paper>
              );
            })
          : null}

        {board ? (
          <Paper
            variant="outlined"
            sx={{
              p: 2.5,
              bgcolor: "background.paper",
              borderColor: "divider",
            }}
          >
            <Typography
              variant="subtitle1"
              component="h2"
              sx={{ fontWeight: 600, mb: 1.5, color: "primary.main" }}
            >
              Weekly board
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
              sx={{ mb: 1.5 }}
            >
              Week {board.weekKey} (UTC)
              {gamification && !gamification.boardOptIn
                ? " · Opt in under Settings to appear on the board"
                : null}
            </Typography>
            {board.entries.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No entries yet this week.
              </Typography>
            ) : (
              <Stack spacing={0.75}>
                {board.entries.map((entry, i) => (
                  <Typography key={entry.userId} variant="body2">
                    {i + 1}. {entry.displayName ?? "Learner"} · {entry.xp} XP
                  </Typography>
                ))}
              </Stack>
            )}
          </Paper>
        ) : null}

        <MagnificCredits />
      </Stack>
    </Container>
  );
}

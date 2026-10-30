import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  ApiError,
  getAchievements,
  getGamification,
  getWeeklyLeaderboard,
  me,
  type AchievementItemView,
  type GamificationResponse,
  type LeaderboardResponse,
} from "../api/client";
import {
  FRUIT_LABEL,
  FRUIT_ORDER,
  RARITY_LABEL,
  type FruitType,
} from "../achievements/catalog";
import FruitMedal from "../achievements/FruitMedal";
import MagnificCredits from "../achievements/MagnificCredits";
import { isGuest } from "../guest/session";
import { useTrackedOp } from "../progress/useTrackedOp";

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
  items: AchievementItemView[],
): Map<FruitType, AchievementItemView[]> {
  const map = new Map<FruitType, AchievementItemView[]>();
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

function staggerDelay(unlockedIndex: number): string {
  const ms = Math.min(unlockedIndex * 40, 240);
  return `${ms}ms`;
}

export default function AchievementsPage() {
  const [items, setItems] = useState<AchievementItemView[]>([]);
  const [gamification, setGamification] = useState<GamificationResponse | null>(
    null,
  );
  const [board, setBoard] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guest, setGuest] = useState(false);
  const [ready, setReady] = useState(false);
  const [sheenOnceIds, setSheenOnceIds] = useState<Set<string>>(
    () => new Set(),
  );
  const { end: endLoad } = useTrackedOp("Loading achievements…", {
    trackOnMount: true,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await me();
        const guestMode = isGuest();
        if (guestMode) {
          if (!cancelled) {
            setGuest(true);
            setReady(true);
            endLoad();
          }
          return;
        }
        // Summary + board are garnish; the medal grid must still render without them.
        const [ach, gam, lb] = await Promise.all([
          getAchievements(),
          getGamification().catch(() => null),
          getWeeklyLeaderboard().catch(() => null),
        ]);
        if (cancelled) return;
        setItems(ach.items);
        setGamification(gam);
        setBoard(lb);
        setGuest(false);
        setReady(true);
        endLoad();
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.assign("/login");
          return;
        }
        setError(
          err instanceof ApiError ? err.message : "Failed to load achievements",
        );
        setReady(true);
        endLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endLoad]);

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
                    {list.map((item) => {
                      const unlocked = item.completedAt != null;
                      const rarity = item.def.rarity;
                      const showSheen =
                        unlocked &&
                        rarity === "legendary" &&
                        sheenOnceIds.has(item.def.id);
                      return (
                        <Box
                          key={item.def.id}
                          sx={{
                            display: "flex",
                            gap: 1.5,
                            alignItems: "flex-start",
                            opacity: unlocked ? 1 : 0.55,
                            ...(unlocked
                              ? {
                                  animation: `achievementStagger 420ms cubic-bezier(0.16, 1, 0.3, 1) ${staggerDelay(staggerIndexById.get(item.def.id) ?? 0)} both`,
                                  "@media (prefers-reduced-motion: reduce)": {
                                    animation: "none",
                                    opacity: 1,
                                  },
                                }
                              : {}),
                          }}
                        >
                          <FruitMedal
                            fruitType={fruit}
                            traits={item.traits}
                            size={48}
                            locked={!unlocked}
                            sheenOnce={showSheen}
                          />
                          <Box flex={1} minWidth={0}>
                            <Typography variant="subtitle2" fontWeight={600}>
                              {item.def.title}
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text.secondary"
                              display="block"
                            >
                              {RARITY_LABEL[rarity]} · {item.def.description}
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
                            ) : item.progress ? (
                              <Box sx={{ mt: 1 }}>
                                <LinearProgress
                                  variant="determinate"
                                  value={Math.min(
                                    100,
                                    (item.progress.currentValue /
                                      item.progress.threshold) *
                                      100,
                                  )}
                                  sx={{ height: 6, borderRadius: 1 }}
                                />
                                <Typography
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {item.progress.currentValue} /{" "}
                                  {item.progress.threshold}
                                </Typography>
                              </Box>
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
                    })}
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

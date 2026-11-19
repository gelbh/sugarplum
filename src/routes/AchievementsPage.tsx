import { useEffect, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MagnificCredits from "../achievements/MagnificCredits";
import MedalCabinet from "../achievements/MedalCabinet";
import { useAchievementsData } from "../achievements/useAchievementsData";
import type { GamificationResponse } from "../api/client";
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

const NO_ITEMS: AchievementItem[] = [];

function GalleryLayout({
  gamification,
  tally,
  children,
}: {
  gamification: GamificationResponse | null;
  tally?: { collected: number; total: number };
  children: ReactNode;
}) {
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
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            Collect fruit medals as you study, accept cards, and keep your
            streak alive.
          </Typography>
          {gamification ? (
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 1
              }}>
              Streak {gamification.streakCurrent} (best{" "}
              {gamification.streakBest}) · Level {gamification.level} ·{" "}
              {gamification.xpTotal} XP
            </Typography>
          ) : null}
          {tally ? (
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 0.5
              }}>
              {tally.collected} / {tally.total} collected
            </Typography>
          ) : null}
        </Box>

        {children}

        <MagnificCredits />
      </Stack>
    </Container>
  );
}

export default function AchievementsPage() {
  const data = useAchievementsData();
  const items = data.status === "ready" ? data.items : NO_ITEMS;
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

  switch (data.status) {
    case "loading":
      return (
        <Container maxWidth="sm" sx={{ py: 6 }}>
          <Typography sx={{
            color: "text.secondary"
          }}>Loading achievements…</Typography>
        </Container>
      );
    case "guest":
      return (
        <Container maxWidth="sm" sx={{ py: { xs: 4, md: 5 } }}>
          <Stack spacing={2}>
            <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
              Achievements
            </Typography>
            <Alert severity="info">
              Sign in to track streaks, XP, and fruit medals. Guest study stays
              on this device only.
            </Alert>
            <Button variant="contained" href="/login">
              Sign in
            </Button>
            <MagnificCredits />
          </Stack>
        </Container>
      );
    case "error":
      return (
        <GalleryLayout gamification={null}>
          <Alert severity="error">{data.message}</Alert>
        </GalleryLayout>
      );
    case "ready": {
      const { gamification, board } = data;
      const collected = items.filter((i) => i.completedAt != null).length;
      return (
        <GalleryLayout
          gamification={gamification}
          tally={{ collected, total: items.length }}
        >
          <MedalCabinet items={items} sheenIds={sheenOnceIds} />

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
                sx={{
                  color: "text.secondary",
                  display: "block",
                  mb: 1.5
                }}>
                Week {board.weekKey} (UTC)
                {gamification && !gamification.boardOptIn
                  ? " · Opt in under Settings to appear on the board"
                  : null}
              </Typography>
              {board.entries.length === 0 ? (
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
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
        </GalleryLayout>
      );
    }
    default: {
      const unhandled: never = data;
      void unhandled;
      return null;
    }
  }
}

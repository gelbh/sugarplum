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
import OrchardOverview from "../achievements/OrchardOverview";
import { useAchievementsData } from "../achievements/useAchievementsData";
import type { GamificationResponse } from "../api/client";
import type { AchievementItem } from "../achievements/wire";
import {
  insightsBandTitleSx,
  insightsBrandSerif,
  insightsPageTitleSx,
  insightsPaperSx,
} from "../insights/operatePaper";

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
    <Container
      maxWidth="sm"
      sx={{
        py: { xs: 4, md: 5 },
        position: "relative",
        "&::before": {
          content: '""',
          pointerEvents: "none",
          position: "absolute",
          inset: "0 8% auto",
          height: 280,
          background:
            "radial-gradient(ellipse 70% 55% at 50% 0%, rgba(196, 165, 116, 0.16) 0%, transparent 72%)",
          zIndex: 0,
        },
      }}
    >
      <Stack
        spacing={3.25}
        sx={{
          position: "relative",
          zIndex: 1,
          "@keyframes achievementStagger": {
            from: { opacity: 0, transform: "translateY(6px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
        }}
      >
        <Box>
          <Typography variant="h3" component="h1" sx={insightsPageTitleSx}>
            Achievements
          </Typography>
          <Box
            aria-hidden
            sx={{
              mt: 1.75,
              width: 48,
              height: 3,
              borderRadius: 1,
              bgcolor: "secondary.main",
            }}
          />
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", mt: 2, maxWidth: "38ch" }}
          >
            Collect fruit medals as you study, accept cards, and keep your
            streak alive.
          </Typography>
          {tally ? (
            <Typography
              variant="body2"
              sx={{ color: "text.secondary", mt: 1.25 }}
            >
              <Box
                component="span"
                sx={{
                  fontFamily: insightsBrandSerif,
                  color: "secondary.main",
                  fontSize: "1.15rem",
                  mr: 0.75,
                }}
              >
                {tally.collected}
              </Box>
              / {tally.total} collected
            </Typography>
          ) : null}
        </Box>

        {gamification ? <OrchardOverview gamification={gamification} /> : null}

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
            <Typography variant="h3" component="h1" sx={insightsPageTitleSx}>
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
          <Box>
            <Typography component="h2" sx={insightsBandTitleSx}>
              Fruit medals
            </Typography>
            <MedalCabinet items={items} sheenIds={sheenOnceIds} />
          </Box>

          {board ? (
            <Box>
              <Typography component="h2" sx={insightsBandTitleSx}>
                Weekly board
              </Typography>
              <Paper variant="outlined" sx={insightsPaperSx}>
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    display: "block",
                    mb: 1.5,
                  }}
                >
                  Week {board.weekKey} (UTC)
                  {gamification && !gamification.boardOptIn
                    ? " · Opt in under Settings to appear on the board"
                    : null}
                </Typography>
                {board.entries.length === 0 ? (
                  <Typography
                    variant="body2"
                    sx={{ color: "text.secondary" }}
                  >
                    No entries yet this week.
                  </Typography>
                ) : (
                  <Stack spacing={0.75}>
                    {board.entries.map((entry, i) => (
                      <Typography key={entry.userId} variant="body2">
                        {i + 1}. {entry.displayName ?? "Learner"} ·{" "}
                        <Box
                          component="span"
                          sx={{
                            fontFamily: insightsBrandSerif,
                            color: "secondary.main",
                          }}
                        >
                          {entry.xp}
                        </Box>{" "}
                        XP
                      </Typography>
                    ))}
                  </Stack>
                )}
              </Paper>
            </Box>
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

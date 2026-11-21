import { useEffect, useState, type ReactNode } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MedalCabinet from "../achievements/MedalCabinet";
import OrchardOverview from "../achievements/OrchardOverview";
import WeeklyBoard from "../achievements/WeeklyBoard";
import { useAchievementsData } from "../achievements/useAchievementsData";
import type { AchievementItem } from "../achievements/wire";
import {
  insightsBandTitleSx,
  insightsBrandSerif,
  insightsPageTitleSx,
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

function GalleryLayout({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        position: "relative",
        flex: 1,
        width: "100%",
        minHeight: "100%",
        // Atmosphere lives on the full main pane so it never clips at Container edges.
        "&::before": {
          content: '""',
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 70% 42% at 68% 0%, rgba(196, 165, 116, 0.18) 0%, transparent 72%), radial-gradient(ellipse 55% 38% at 12% 0%, rgba(91, 44, 111, 0.2) 0%, transparent 70%)",
          zIndex: 0,
        },
        "&::after": {
          content: '""',
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          zIndex: 0,
        },
      }}
    >
      <Container
        maxWidth="lg"
        sx={{
          py: { xs: 4, md: 5 },
          px: { xs: 2, md: 3 },
          position: "relative",
          zIndex: 1,
        }}
      >
        <Stack
          spacing={3.25}
          sx={{
            "@keyframes achievementStagger": {
              from: { opacity: 0, transform: "translateY(6px)" },
              to: { opacity: 1, transform: "translateY(0)" },
            },
          }}
        >
          <Box>
            <Typography variant="h3" component="h1" sx={insightsPageTitleSx}>
              Orchard
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
          </Box>

          {children}
        </Stack>
      </Container>
    </Box>
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
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Typography sx={{ color: "text.secondary" }}>
            Loading achievements…
          </Typography>
        </Container>
      );
    case "guest":
      return (
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 5 } }}>
          <Stack spacing={2}>
            <Typography variant="h3" component="h1" sx={insightsPageTitleSx}>
              Orchard
            </Typography>
            <Alert severity="info">
              Sign in to track streaks, XP, and fruits. Guest study stays
              on this device only.
            </Alert>
            <Button variant="contained" href="/login">
              Sign in
            </Button>
          </Stack>
        </Container>
      );
    case "error":
      return (
        <GalleryLayout>
          <Alert severity="error">{data.message}</Alert>
        </GalleryLayout>
      );
    case "ready": {
      const { gamification, board } = data;
      const collected = items.filter((i) => i.completedAt != null).length;
      return (
        <GalleryLayout>
          <Box
            sx={{
              display: "grid",
              gap: { xs: 3.5, md: 3.5 },
              alignItems: "start",
              gridTemplateColumns: {
                xs: "1fr",
                // Equal columns so both sides share one vertical rhythm.
                md: "minmax(0, 1fr) minmax(0, 1fr)",
              },
            }}
          >
            <Stack
              spacing={2}
              sx={{
                order: { xs: 1, md: 1 },
                position: { md: "sticky" },
                top: { md: 24 },
                width: "100%",
                minWidth: 0,
                "& > *": { width: "100%", minWidth: 0 },
              }}
            >
              <Stack
                direction="row"
                alignItems="baseline"
                justifyContent="space-between"
                gap={1}
                flexWrap="wrap"
                sx={{ mb: 1.25, minHeight: 52 }}
              >
                <Typography
                  component="h2"
                  sx={{ ...insightsBandTitleSx, mb: 0 }}
                >
                  Progress
                </Typography>
                {gamification ? (
                  <Typography
                    variant="body2"
                    sx={{ color: "rgba(232, 216, 199, 0.72)" }}
                  >
                    Level{" "}
                    <Box
                      component="span"
                      sx={{
                        fontFamily: insightsBrandSerif,
                        color: "secondary.main",
                        fontSize: "1.15rem",
                        mx: 0.35,
                      }}
                    >
                      {gamification.level}
                    </Box>
                    · {gamification.xpTotal} XP total
                  </Typography>
                ) : null}
              </Stack>
              {gamification ? (
                <OrchardOverview gamification={gamification} />
              ) : null}
              {board ? <WeeklyBoard board={board} /> : null}
            </Stack>

            <Box sx={{ order: { xs: 2, md: 2 }, minWidth: 0, width: "100%" }}>
              <Stack
                direction="row"
                alignItems="baseline"
                justifyContent="space-between"
                gap={1}
                flexWrap="wrap"
                sx={{ mb: 1.25, minHeight: 52 }}
              >
                <Typography
                  component="h2"
                  sx={{ ...insightsBandTitleSx, mb: 0 }}
                >
                  Fruits
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ color: "rgba(232, 216, 199, 0.72)" }}
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
                    {collected}
                  </Box>
                  / {items.length} collected
                </Typography>
              </Stack>
              <MedalCabinet items={items} sheenIds={sheenOnceIds} />
            </Box>
          </Box>
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

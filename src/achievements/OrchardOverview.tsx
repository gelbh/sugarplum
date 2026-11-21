import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import type { GamificationResponse } from "../api/client";
import { insightsBrandSerif } from "../insights/operatePaper";
import { orchardOverviewSx } from "./orchardSurfaces";

type Props = {
  gamification: GamificationResponse;
};

function AliceValue({
  children,
  accent = "primary",
}: {
  children: string | number;
  accent?: "primary" | "secondary";
}) {
  return (
    <Typography
      component="span"
      sx={{
        fontFamily: insightsBrandSerif,
        fontWeight: 400,
        fontSize: { xs: "1.85rem", sm: "2.1rem" },
        lineHeight: 1,
        letterSpacing: "0.01em",
        fontVariantNumeric: "tabular-nums",
        color: accent === "secondary" ? "secondary.main" : "primary.main",
      }}
    >
      {children}
    </Typography>
  );
}

function FreezeChip({ count }: { count: number }) {
  const tip =
    count === 1
      ? "Covers one missed study day"
      : "Each freeze covers one missed study day";
  return (
    <Tooltip title={tip}>
      <Box
        component="span"
        sx={{
          display: "inline-flex",
          alignItems: "center",
          px: 1,
          py: 0.25,
          borderRadius: 999,
          border: "1px solid",
          borderColor: "rgba(196, 165, 116, 0.45)",
          bgcolor: "rgba(196, 165, 116, 0.12)",
          color: "secondary.main",
          fontSize: "0.75rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
          lineHeight: 1.4,
          cursor: "help",
        }}
      >
        {count} freeze{count === 1 ? "" : "s"}
      </Box>
    </Tooltip>
  );
}

export default function OrchardOverview({ gamification }: Props) {
  const goalPct =
    gamification.dailyGoalReviews > 0
      ? Math.min(
          100,
          (gamification.dailyGoalProgress / gamification.dailyGoalReviews) *
            100,
        )
      : 0;
  const goalMet = gamification.dailyGoalMet;
  const streakLive = gamification.streakCurrent > 0;

  return (
    <Paper elevation={0} sx={orchardOverviewSx}>
      <Stack spacing={2.25}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 2.75 }}
          sx={{ alignItems: { sm: "stretch" } }}
        >
          <Stack spacing={0.6} sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              component="h2"
              sx={{
                fontFamily: insightsBrandSerif,
                fontWeight: 400,
                letterSpacing: "0.03em",
                fontSize: "1rem",
                color: "text.primary",
              }}
            >
              Streak
            </Typography>
            {streakLive ? (
              <Stack
                direction="row"
                spacing={1}
                sx={{ alignItems: "baseline", flexWrap: "wrap" }}
              >
                <AliceValue accent="secondary">
                  {gamification.streakCurrent}
                </AliceValue>
                <Typography
                  variant="body2"
                  sx={{ color: "text.secondary", fontWeight: 500 }}
                >
                  day{gamification.streakCurrent === 1 ? "" : "s"}
                  {gamification.streakDayMet
                    ? " · studied today"
                    : " · keep it going"}
                </Typography>
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                New streak starts when you study today.
              </Typography>
            )}
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{
                flexWrap: "wrap",
                alignItems: "center",
                pt: 0.25,
              }}
            >
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Best {gamification.streakBest}
              </Typography>
              <FreezeChip count={gamification.streakFreezes} />
            </Stack>
          </Stack>

          <Box
            aria-hidden
            sx={{
              display: { xs: "none", sm: "block" },
              width: "1px",
              alignSelf: "stretch",
              bgcolor: "divider",
              opacity: 0.7,
              flexShrink: 0,
            }}
          />

          <Stack spacing={0.6} sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
              <Typography
                component="h2"
                sx={{
                  fontFamily: insightsBrandSerif,
                  fontWeight: 400,
                  letterSpacing: "0.03em",
                  fontSize: "1rem",
                  color: "text.primary",
                }}
              >
                Daily goal
              </Typography>
              <Tooltip title="Optional volume target. Meeting it does not control your streak.">
                <IconButton
                  size="small"
                  aria-label="About daily goal"
                  sx={{ color: "text.secondary", p: 0.35 }}
                >
                  <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Stack>
            <Stack
              direction="row"
              spacing={1}
              sx={{ alignItems: "baseline", flexWrap: "wrap" }}
            >
              <AliceValue accent={goalMet ? "secondary" : "primary"}>
                {gamification.dailyGoalProgress}
              </AliceValue>
              <Typography
                variant="body2"
                sx={{ color: "text.secondary", fontWeight: 500 }}
              >
                / {gamification.dailyGoalReviews} reviews
                {goalMet ? " · done (+XP)" : ""}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={goalPct}
              color={goalMet ? "secondary" : "primary"}
              sx={{
                mt: 0.5,
                height: 8,
                borderRadius: 999,
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? "rgba(232, 216, 199, 0.1)"
                    : "rgba(91, 44, 111, 0.1)",
                "& .MuiLinearProgress-bar": {
                  borderRadius: 999,
                },
              }}
            />
          </Stack>
        </Stack>

        <Box
          aria-hidden
          sx={{
            height: "1px",
            bgcolor: "divider",
            opacity: 0.65,
          }}
        />

        <Typography
          variant="body2"
          sx={{ color: "rgba(232, 216, 199, 0.72)" }}
        >
          {gamification.xpToday > 0 ? (
            <>
              Today{" "}
              <Box
                component="span"
                sx={{
                  fontFamily: insightsBrandSerif,
                  color: "secondary.main",
                  fontSize: "1.05rem",
                  mx: 0.35,
                }}
              >
                {gamification.xpToday}
              </Box>{" "}
              XP
            </>
          ) : (
            "No XP today yet"
          )}
        </Typography>
      </Stack>
    </Paper>
  );
}

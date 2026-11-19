import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import InsightsAliceStat from "./InsightsAliceStat";
import MetricTip from "./MetricTip";
import {
  TIP_CONSISTENCY,
  TIP_DUE_TODAY,
  TIP_EST_RECALL,
  TIP_LEVEL,
  TIP_OVERDUE,
  TIP_REMEMBERED,
  TIP_STREAK,
  TIP_TRUE_RETENTION,
} from "./metricTips";
import {
  insightsBrandSerif,
  insightsHeroPaperSx,
} from "./operatePaper";
import {
  insightsVerdictStatus,
  type InsightsVerdictStatus,
} from "./verdictStatus";

export type VerdictHeroProps = {
  recallPct: number | null;
  retentionPct: number | null;
  targetRetentionPct: number | null;
  youngPct: number | null;
  maturePct: number | null;
  dueToday: number;
  overdue: number;
  etkDisplay: number | null;
  consistencyPct: number | null;
  streakCurrent?: number;
  streakBest?: number;
  level?: number;
  xpTotal?: number;
  showGamification: boolean;
};

function QuietStat({
  value,
  label,
  detail,
  tip,
}: {
  value: string;
  label: string;
  detail?: string;
  tip?: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="body2"
        sx={{
          color: "text.secondary",
          display: "block",
          fontWeight: 500
        }}>
        {tip ? <MetricTip title={tip}>{label}</MetricTip> : label}
      </Typography>
      <Typography
        component="p"
        sx={{
          fontFamily: insightsBrandSerif,
          fontWeight: 400,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.1,
          mt: 0.35,
          fontSize: "1.65rem",
          letterSpacing: "0.01em",
          color: "text.primary",
        }}
      >
        {value}
      </Typography>
      {detail ? (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            display: "block",
            mt: 0.35
          }}>
          {detail}
        </Typography>
      ) : null}
    </Box>
  );
}

function statusChipColor(
  status: InsightsVerdictStatus | null,
): "success" | "warning" | "default" {
  if (status?.kind === "on_track") return "success";
  if (status?.kind === "below_target") return "warning";
  return "default";
}

/** Mix: Alice/plum Est. recall owns the wash field; support KPIs stay quiet. */
export default function VerdictHero({
  recallPct,
  retentionPct,
  targetRetentionPct,
  youngPct,
  maturePct,
  dueToday,
  overdue,
  etkDisplay,
  consistencyPct,
  streakCurrent,
  streakBest,
  level,
  xpTotal,
  showGamification,
}: VerdictHeroProps) {
  const status = insightsVerdictStatus(retentionPct, targetRetentionPct);

  return (
    <Stack spacing={1.5}>
      <Box
        sx={{
          "@keyframes insightsVerdictIn": {
            from: { opacity: 0, transform: "translateY(10px)" },
            to: { opacity: 1, transform: "translateY(0)" },
          },
          animation: "insightsVerdictIn 420ms cubic-bezier(0.16, 1, 0.3, 1)",
          "@media (prefers-reduced-motion: reduce)": {
            animation: "none",
          },
        }}
      >
      <Paper variant="outlined" sx={insightsHeroPaperSx}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 3, md: 0 }}
          sx={{
            alignItems: { md: "center" }
          }}
        >
          <Box
            sx={{
              flex: { md: "1 1 58%" },
              minWidth: 0,
              pr: { md: 4 },
            }}
          >
            <Typography
              component="p"
              sx={{
                fontFamily: insightsBrandSerif,
                fontWeight: 400,
                fontSize: { xs: "4.5rem", sm: "5.5rem", md: "6rem" },
                lineHeight: 0.88,
                letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
                color: "primary.main",
              }}
            >
              {recallPct == null ? "—" : `${recallPct}%`}
            </Typography>
            <Typography
              variant="h6"
              component="p"
              sx={{
                fontFamily: insightsBrandSerif,
                fontWeight: 400,
                letterSpacing: "0.02em",
                mt: 1.25,
                color: "text.primary",
              }}
            >
              <MetricTip title={TIP_EST_RECALL}>Est. recall</MetricTip>
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                display: "block",
                mt: 1.25,
                maxWidth: 42 * 8
              }}>
              Average chance you remember accepted cards right now.
            </Typography>
          </Box>

          <Divider
            orientation="vertical"
            flexItem
            sx={{
              display: { xs: "none", md: "block" },
              borderColor: "divider",
            }}
          />
          <Divider
            sx={{
              display: { xs: "block", md: "none" },
              borderColor: "divider",
            }}
          />

          <Stack
            spacing={2.5}
            sx={{
              flex: { md: "1 1 42%" },
              minWidth: 0,
              pl: { md: 4 },
              py: { md: 0.5 },
            }}
          >
            <Box>
              <QuietStat
                value={retentionPct == null ? "—" : `${retentionPct}%`}
                label="True retention"
                tip={TIP_TRUE_RETENTION}
                detail={`Young ${youngPct == null ? "—" : `${youngPct}%`} · Mature ${
                  maturePct == null ? "—" : `${maturePct}%`
                }`}
              />
              <Stack
                direction="row"
                spacing={1}
                useFlexGap
                sx={{
                  flexWrap: "wrap",
                  alignItems: "center",
                  mt: 1
                }}>
                {status ? (
                  <Chip
                    size="small"
                    color={statusChipColor(status)}
                    label={status.label}
                    sx={{ fontWeight: 600 }}
                  />
                ) : targetRetentionPct == null ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label="Set a retention target in Settings"
                    sx={{ fontWeight: 500 }}
                  />
                ) : retentionPct == null ? (
                  <Chip
                    size="small"
                    variant="outlined"
                    label="Need more reviews for true retention"
                    sx={{ fontWeight: 500 }}
                  />
                ) : null}
              </Stack>
            </Box>
            <Stack direction="row" spacing={3.5} useFlexGap sx={{
              flexWrap: "wrap"
            }}>
              <QuietStat
                value={String(dueToday)}
                label="Due today"
                tip={TIP_DUE_TODAY}
              />
              <QuietStat
                value={String(overdue)}
                label="Overdue"
                tip={TIP_OVERDUE}
              />
            </Stack>
          </Stack>
        </Stack>
      </Paper>
      </Box>

      <Box
        sx={(theme) => ({
          px: { xs: 0.25, md: 0.5 },
          py: 1.1,
          borderBottom: "1px solid",
          borderColor: "divider",
          ...theme.applyStyles("dark", {
            borderColor: "rgba(232, 216, 199, 0.16)",
          }),
        })}
      >
        <Stack
          direction="row"
          spacing={{ xs: 2, sm: 2.75 }}
          useFlexGap
          sx={{
            flexWrap: "wrap",
            alignItems: "center"
          }}>
          <InsightsAliceStat
            size="sm"
            value={etkDisplay == null ? "—" : `~${etkDisplay}`}
            label="remembered"
            tip={TIP_REMEMBERED}
          />
          <InsightsAliceStat
            size="sm"
            value={consistencyPct == null ? "—" : `${consistencyPct}%`}
            label="consistency"
            tip={TIP_CONSISTENCY}
          />
          {showGamification ? (
            <>
              <InsightsAliceStat
                size="sm"
                value={String(streakCurrent ?? "—")}
                label={
                  streakBest != null
                    ? `day streak · best ${streakBest}`
                    : "day streak"
                }
                tip={TIP_STREAK}
              />
              <InsightsAliceStat
                size="sm"
                value={level != null ? `L${level}` : "—"}
                label={xpTotal != null ? `${xpTotal} XP` : "level"}
                tip={TIP_LEVEL}
              />
            </>
          ) : null}
        </Stack>
      </Box>
    </Stack>
  );
}

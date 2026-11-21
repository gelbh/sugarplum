import { useEffect, useState } from "react";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  getLeaderboard,
  type LeaderboardPeriod,
  type LeaderboardResponse,
} from "../api/client";
import { insightsBrandSerif } from "../insights/operatePaper";
import { orchardBoardSx } from "./orchardSurfaces";

type Entry = {
  userId: string;
  displayName: string | null;
  xp: number;
};

/** Gold / silver / bronze metal for podium trophies. */
const METAL = {
  gold: { fill: "#E2B84A", glow: "rgba(226, 184, 74, 0.4)" },
  silver: { fill: "#C5CDD8", glow: "rgba(197, 205, 216, 0.32)" },
  bronze: { fill: "#C47A4A", glow: "rgba(196, 122, 74, 0.34)" },
} as const;

const PODIUM_META = [
  {
    place: 2 as const,
    metal: "silver" as const,
    height: 72,
    tone: "rgba(197, 205, 216, 0.16)",
    edge: "rgba(197, 205, 216, 0.5)",
  },
  {
    place: 1 as const,
    metal: "gold" as const,
    height: 108,
    tone: "rgba(226, 184, 74, 0.18)",
    edge: "rgba(226, 184, 74, 0.55)",
  },
  {
    place: 3 as const,
    metal: "bronze" as const,
    height: 56,
    tone: "rgba(196, 122, 74, 0.16)",
    edge: "rgba(196, 122, 74, 0.5)",
  },
];

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

function displayName(name: string | null) {
  return name?.trim() || "Learner";
}

function XpMark({ xp }: { xp: number }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: insightsBrandSerif,
        color: "secondary.main",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {xp}
    </Box>
  );
}

function RankChip({
  label,
  emphasis,
}: {
  label: string;
  emphasis?: boolean;
}) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        px: 1,
        py: 0.35,
        borderRadius: 1,
        border: "1px solid",
        borderColor: emphasis
          ? "rgba(196, 165, 116, 0.55)"
          : "rgba(255,255,255,0.12)",
        bgcolor: emphasis
          ? "rgba(196, 165, 116, 0.14)"
          : "rgba(255,255,255,0.04)",
        color: emphasis ? "secondary.main" : "text.secondary",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.02em",
        lineHeight: 1.3,
      }}
    >
      {label}
    </Box>
  );
}

function PeriodTabs({
  value,
  onChange,
}: {
  value: LeaderboardPeriod;
  onChange: (next: LeaderboardPeriod) => void;
}) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      role="tablist"
      aria-label="Leaderboard period"
      sx={{ alignItems: "center" }}
    >
      {(
        [
          { id: "week", label: "Weekly" },
          { id: "all", label: "All time" },
        ] as const
      ).map((tab) => {
        const selected = value === tab.id;
        return (
          <ButtonBase
            key={tab.id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.id)}
            sx={{
              px: 1.1,
              py: 0.55,
              borderRadius: 1,
              color: selected ? "secondary.main" : "text.secondary",
              fontSize: "0.82rem",
              fontWeight: selected ? 600 : 500,
              letterSpacing: "0.01em",
              position: "relative",
              transition: `color 180ms ${EASE}`,
              "&::after": {
                content: '""',
                position: "absolute",
                left: 10,
                right: 10,
                bottom: 2,
                height: 2,
                borderRadius: 1,
                bgcolor: selected ? "secondary.main" : "transparent",
                transition: `background-color 180ms ${EASE}`,
              },
              "&:hover": {
                color: selected ? "secondary.main" : "text.primary",
              },
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: 2,
              },
            }}
          >
            {tab.label}
          </ButtonBase>
        );
      })}
    </Stack>
  );
}

function PodiumSlot({
  entry,
  place,
  metal,
  height,
  tone,
  edge,
  you,
}: {
  entry: Entry | undefined;
  place: 1 | 2 | 3;
  metal: keyof typeof METAL;
  height: number;
  tone: string;
  edge: string;
  you: boolean;
}) {
  const name = entry ? displayName(entry.displayName) : "—";
  const { fill, glow } = METAL[metal];
  const trophySize = place === 1 ? 40 : 30;
  return (
    <Stack
      spacing={1}
      alignItems="center"
      sx={{
        flex: 1,
        minWidth: 0,
        alignSelf: "flex-end",
        "@keyframes podiumRise": {
          from: { opacity: 0.35, transform: "translateY(10px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
        animation: `podiumRise 420ms ${EASE} both`,
        animationDelay: place === 1 ? "40ms" : place === 2 ? "0ms" : "80ms",
        "@media (prefers-reduced-motion: reduce)": {
          animation: "none",
        },
      }}
    >
      <EmojiEventsIcon
        aria-hidden
        sx={{
          fontSize: trophySize,
          color: fill,
          filter: `drop-shadow(0 4px 10px ${glow})`,
          opacity: entry ? 1 : 0.35,
          mb: 0.15,
        }}
      />
      <Stack spacing={0.2} alignItems="center" sx={{ width: "100%", px: 0.25 }}>
        <Typography
          variant="body2"
          title={you ? `${name} · you` : name}
          sx={{
            color: you ? fill : "text.primary",
            fontWeight: you ? 700 : 500,
            textAlign: "center",
            lineHeight: 1.2,
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontSize: place === 1 ? "0.88rem" : "0.8rem",
          }}
        >
          {name}
        </Typography>
        {you ? (
          <Typography
            variant="caption"
            sx={{
              color: fill,
              fontWeight: 600,
              fontSize: "0.68rem",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            you
          </Typography>
        ) : null}
        {entry ? (
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              fontVariantNumeric: "tabular-nums",
              fontSize: "0.72rem",
              opacity: 0.9,
            }}
          >
            <XpMark xp={entry.xp} /> XP
          </Typography>
        ) : (
          <Typography variant="caption" sx={{ color: "text.disabled" }}>
            open
          </Typography>
        )}
      </Stack>
      <Box
        sx={{
          width: "100%",
          height,
          borderRadius: "10px 10px 3px 3px",
          bgcolor: tone,
          border: "1px solid",
          borderColor: you ? "rgba(255,255,255,0.55)" : edge,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          pt: 1.15,
          boxShadow:
            place === 1
              ? `0 8px 18px ${glow}`
              : `0 4px 12px rgba(0,0,0,0.16)`,
        }}
      >
        <Typography
          sx={{
            fontFamily: insightsBrandSerif,
            fontSize: place === 1 ? "1.65rem" : "1.25rem",
            lineHeight: 1,
            color: fill,
          }}
        >
          {place}
        </Typography>
      </Box>
    </Stack>
  );
}

function NearRow({
  rank,
  name,
  xp,
  highlight,
}: {
  rank: number;
  name: string;
  xp: number;
  highlight?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 1.5,
        px: 1.25,
        py: 0.85,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: highlight
          ? "rgba(196, 165, 116, 0.45)"
          : "transparent",
        bgcolor: highlight
          ? "rgba(196, 165, 116, 0.1)"
          : "rgba(255,255,255,0.03)",
      }}
    >
      <Typography
        variant="body2"
        sx={{
          color: highlight ? "text.primary" : "text.secondary",
          fontWeight: highlight ? 600 : 400,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        <Box component="span" sx={{ color: "text.secondary", mr: 0.75 }}>
          #{rank}
        </Box>
        {name}
        {highlight ? " · you" : ""}
      </Typography>
      <Typography
        variant="body2"
        sx={{ flexShrink: 0, color: "text.secondary" }}
      >
        <XpMark xp={xp} /> XP
      </Typography>
    </Box>
  );
}

export default function WeeklyBoard({
  board: initialBoard,
}: {
  board: LeaderboardResponse;
}) {
  const [period, setPeriod] = useState<LeaderboardPeriod>("week");
  const [weekBoard, setWeekBoard] = useState(initialBoard);
  const [allBoard, setAllBoard] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setWeekBoard(initialBoard);
  }, [initialBoard]);

  useEffect(() => {
    if (period !== "all") {
      setLoading(false);
      return;
    }
    if (allBoard) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLeaderboard("all")
      .then((next) => {
        if (!cancelled) setAllBoard(next);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load that board.");
      })
      .finally(() => {
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period, allBoard]);

  const isWeek = period === "week";
  const board = isWeek ? weekBoard : allBoard;
  const waitingAll = !isWeek && !board;
  const me = board?.me;
  const podium = board?.entries.slice(0, 3) ?? [];
  const byPlace = (place: number) => podium[place - 1];
  const podiumIds = new Set(podium.map((e) => e.userId));
  const aroundOnly = (me?.neighbors ?? []).filter(
    (n) => !podiumIds.has(n.userId),
  );
  const onPodium = me?.rank != null && me.rank <= 3;
  const showNearYou = Boolean(me && !onPodium && aroundOnly.length > 0);
  const vsLast =
    me && isWeek && me.xpLastWeek > 0
      ? me.xp - me.xpLastWeek
      : me && isWeek && me.xp > 0
        ? me.xp
        : null;
  const isYou = (rank: number) => me?.rank != null && rank === me.rank;
  const rankLabel =
    me == null
      ? null
      : me.rank != null
        ? onPodium
          ? `#${me.rank} · podium`
          : `#${me.rank}`
        : me.xp > 0
          ? "Unlisted"
          : "No XP yet";

  return (
    <Box
      sx={{
        opacity: loading || waitingAll ? 0.72 : 1,
        transition: `opacity 200ms ${EASE}`,
      }}
    >
      <Paper elevation={0} sx={orchardBoardSx}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          gap={1}
          flexWrap="wrap"
          sx={{ mb: 1.5 }}
        >
          <Typography
            component="h3"
            sx={{
              fontFamily: insightsBrandSerif,
              fontWeight: 400,
              letterSpacing: "0.03em",
              fontSize: "1.05rem",
              color: "text.primary",
              m: 0,
            }}
          >
            Leaderboard
          </Typography>
          <PeriodTabs value={period} onChange={setPeriod} />
        </Stack>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          alignItems="center"
          sx={{ mb: 1.5 }}
        >
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {isWeek
              ? `This week${weekBoard.weekKey ? ` · ${weekBoard.weekKey}` : ""}`
              : "All-time XP · opted-in learners"}
          </Typography>
          {me && !me.optedIn ? (
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Opt in under Settings to appear
            </Typography>
          ) : null}
        </Stack>

        {waitingAll ? (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {error ?? "Loading all-time board…"}
          </Typography>
        ) : me && board ? (
          <>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              flexWrap="wrap"
              alignItems="center"
              sx={{ mb: 2.5 }}
            >
              <RankChip
                label={
                  isWeek ? `This week ${me.xp} XP` : `All time ${me.xp} XP`
                }
                emphasis={me.xp > 0}
              />
              {me.optedIn && rankLabel ? (
                <RankChip label={rankLabel} emphasis />
              ) : null}
              {vsLast != null ? (
                <Typography
                  variant="caption"
                  sx={{ color: "text.secondary" }}
                >
                  vs last week{" "}
                  {vsLast > 0
                    ? `+${vsLast}`
                    : vsLast === 0
                      ? "even"
                      : String(vsLast)}
                </Typography>
              ) : null}
            </Stack>

            {error ? (
              <Typography
                variant="body2"
                sx={{ color: "error.main", mb: 1.5 }}
              >
                {error}
              </Typography>
            ) : null}

            {board.entries.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {isWeek
                  ? "No entries yet this week. Study and opt in to open the board."
                  : "No all-time entries yet. Opt in and earn XP to appear."}
              </Typography>
            ) : (
              <Stack spacing={2.5}>
                <Box
                  key={period}
                  sx={{
                    position: "relative",
                    px: 0.5,
                    pt: 0.5,
                    pb: 0.25,
                    "@keyframes stageIn": {
                      from: { opacity: 0.45, filter: "blur(2px)" },
                      to: { opacity: 1, filter: "blur(0)" },
                    },
                    animation: `stageIn 320ms ${EASE}`,
                    "@media (prefers-reduced-motion: reduce)": {
                      animation: "none",
                    },
                  }}
                >
                  <Stack
                    direction="row"
                    spacing={1.25}
                    alignItems="flex-end"
                    sx={{
                      minHeight: 188,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {PODIUM_META.map((slot) => (
                      <PodiumSlot
                        key={`${period}-${slot.place}`}
                        entry={byPlace(slot.place)}
                        place={slot.place}
                        metal={slot.metal}
                        height={slot.height}
                        tone={slot.tone}
                        edge={slot.edge}
                        you={isYou(slot.place)}
                      />
                    ))}
                  </Stack>
                  <Box
                    aria-hidden
                    sx={{
                      position: "absolute",
                      left: "6%",
                      right: "6%",
                      bottom: 0,
                      height: 10,
                      borderRadius: "50%",
                      bgcolor: "rgba(0,0,0,0.28)",
                      filter: "blur(6px)",
                      zIndex: 0,
                    }}
                  />
                </Box>

                {showNearYou ? (
                  <Stack spacing={0.75}>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "text.secondary",
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                      }}
                    >
                      Near you
                    </Typography>
                    {aroundOnly.map((n) => (
                      <NearRow
                        key={n.userId}
                        rank={n.rank}
                        name={displayName(n.displayName)}
                        xp={n.xp}
                        highlight={isYou(n.rank)}
                      />
                    ))}
                  </Stack>
                ) : null}
              </Stack>
            )}
          </>
        ) : null}
      </Paper>
    </Box>
  );
}

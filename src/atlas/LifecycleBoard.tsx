import { useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { termLabel } from "./filter";
import {
  durationLabel,
  lifecycleModel,
  stageSpan,
  windowLit,
  type Axis,
  type DaySpan,
  type DetectableWindow,
  type PppBracket,
} from "./lifecycle";
import { isShortcutTarget } from "./keys";
import TermList from "./TermList";
import type { DatasetFields } from "./types";

type Props = { fields: DatasetFields };

const PLAY_STEP_MS = 1200;
const MARKER_MS = 300;
const LABEL_COL = { xs: "120px", sm: "148px" };
const STAGE_MIN_PX = 84;
const LANE_PX = 72;

const motion = (props: string) => ({
  transition: props
    .split(",")
    .map((p) => `${p.trim()} ${MARKER_MS}ms cubic-bezier(0.2, 0, 0, 1)`)
    .join(", "),
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
});

const pct = (day: number, ax: Axis) => `${(day / ax.endDay) * 100}%`;

export default function LifecycleBoard({ fields }: Props) {
  const model = useMemo(() => lifecycleModel(fields), [fields]);
  const stages = fields.lifecycleStages;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<HTMLButtonElement>(null);
  const last = stages.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setIndex((i) => i + 1), PLAY_STEP_MS);
    return () => clearTimeout(t);
  }, [playing, index, last]);

  const step = (delta: number) => {
    setPlaying(false);
    setIndex((i) => Math.min(last, Math.max(0, i + delta)));
  };
  const togglePlay = () => {
    if (playing) return setPlaying(false);
    if (index >= last) setIndex(0);
    setPlaying(true);
  };

  const stepRef = useRef(step);
  const toggleRef = useRef(togglePlay);
  stepRef.current = step;
  toggleRef.current = togglePlay;
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!isShortcutTarget(ev)) return;
      if (ev.target instanceof Element && ev.target.closest('[role="tablist"]'))
        return;
      if (ev.key === "ArrowRight") stepRef.current(1);
      else if (ev.key === "ArrowLeft") stepRef.current(-1);
      else if (ev.key === " ") {
        // A focused button turns Space into a click of its own.
        if (ev.target instanceof Element && ev.target.closest("button,a"))
          return;
        toggleRef.current();
      } else return;
      ev.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (stages.length === 0) {
    return (
      <Typography color="text.secondary">
        No lifecycle stages recorded for this parasite yet.
      </Typography>
    );
  }

  const current = stages[index];
  const { lanes, stageLane, axis: ax } = model;
  const span = ax ? stageSpan(fields, index, ax) : null;
  const trackMin = stages.length * STAGE_MIN_PX;

  return (
    <Box
      onPointerDownCapture={(ev) => {
        if (!playRef.current?.contains(ev.target as Node)) setPlaying(false);
      }}
    >
      <Box sx={{ overflowX: "auto" }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: `${LABEL_COL.xs} minmax(${trackMin}px, 1fr)`,
              sm: `${LABEL_COL.sm} minmax(${trackMin}px, 1fr)`,
            },
          }}
        >
          <Box
            sx={{
              // Lane names stay put while a long lifecycle scrolls sideways on a phone.
              position: "sticky",
              left: 0,
              zIndex: 2,
              bgcolor: "background.paper",
            }}
          >
            {lanes.map((lane) => (
              <Box
                key={lane.key}
                sx={{
                  height: LANE_PX,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  pr: 1.5,
                  borderBottom: "1px dashed",
                  borderColor: "divider",
                }}
              >
                <Typography sx={{ fontWeight: 600, fontSize: "0.84rem" }}>
                  {lane.title}
                </Typography>
                {lane.hosts.length > 0 ? (
                  <Typography
                    color="text.secondary"
                    sx={{
                      fontSize: "0.76rem",
                      lineHeight: 1.3,
                      display: "-webkit-box",
                      WebkitLineClamp: { xs: 1, sm: 2 },
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    <TermList terms={lane.hosts} />
                    {lane.more > 0 ? ` +${lane.more}` : null}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Box>
          <Box
            sx={{
              position: "relative",
              display: "grid",
              gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${lanes.length}, ${LANE_PX}px)`,
              backgroundImage: (t) =>
                `repeating-linear-gradient(to bottom, transparent 0 ${
                  LANE_PX - 1
                }px, ${t.palette.divider} ${LANE_PX - 1}px ${LANE_PX}px)`,
            }}
          >
            <Box
              aria-hidden
              sx={{
                gridRow: 1,
                gridColumn: 1,
                height: LANE_PX,
                borderRadius: 1.5,
                bgcolor: (t) => alpha(t.palette.primary.main, 0.1),
                boxShadow: (t) =>
                  `inset 0 0 0 1.5px ${alpha(t.palette.primary.main, 0.55)}`,
                transform: `translate(${index * 100}%, ${
                  stageLane[index] * 100
                }%)`,
                ...motion("transform"),
              }}
            />
            {stages.map((s, i) => (
              <Box
                key={`${s.name}-${i}`}
                sx={{
                  gridColumn: i + 1,
                  gridRow: stageLane[i] + 1,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  px: 0.75,
                  minWidth: 0,
                  zIndex: 1,
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: "primary.main",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {i + 1}
                </Typography>
                <Typography
                  component="span"
                  sx={{
                    fontSize: "0.82rem",
                    fontWeight: i === index ? 700 : 600,
                    lineHeight: 1.2,
                    hyphens: "auto",
                    overflowWrap: "break-word",
                  }}
                >
                  {termLabel(s.name)}
                </Typography>
                {s.durationDays ? (
                  <Typography
                    component="span"
                    color="text.secondary"
                    sx={{ fontSize: "0.72rem", lineHeight: 1.25 }}
                  >
                    {durationLabel(s.durationDays)}
                  </Typography>
                ) : null}
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {ax ? (
        <Timeline
          axis={ax}
          ppp={model.ppp}
          windows={model.windows}
          span={span}
        />
      ) : null}

      <Box
        sx={{
          mt: 2.5,
          pt: 2,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        <Typography
          aria-live="polite"
          color="text.secondary"
          sx={{ mb: 1.25, fontSize: "0.92rem" }}
        >
          Now, step {index + 1} of {stages.length}:{" "}
          <Box component="b" sx={{ color: "text.primary" }}>
            {termLabel(current.name)}
          </Box>
          {current.location ? `, ${current.location}` : null}
          {current.durationDays
            ? ` (${durationLabel(current.durationDays)})`
            : null}
        </Typography>
        <Stack direction="row" gap={1} flexWrap="wrap">
          <Button
            variant="outlined"
            onClick={() => step(-1)}
            disabled={index === 0}
          >
            Previous stage
          </Button>
          <Button
            ref={playRef}
            variant="contained"
            onClick={togglePlay}
            startIcon={playing ? <PauseIcon /> : <PlayArrowIcon />}
            aria-pressed={playing}
          >
            {playing ? "Pause" : "Play lifecycle"}
          </Button>
          <Button
            variant="outlined"
            onClick={() => step(1)}
            disabled={index === last}
          >
            Next stage
          </Button>
        </Stack>
      </Box>

      <Box
        component="ol"
        aria-label="Lifecycle stages"
        sx={{
          listStyle: "none",
          p: 0,
          m: 0,
          mt: 2,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
          gap: 1,
        }}
      >
        {stages.map((s, i) => (
          <li key={`${s.name}-${i}`}>
            <ButtonBase
              onClick={() => {
                setPlaying(false);
                setIndex(i);
              }}
              aria-current={i === index ? "step" : undefined}
              sx={{
                width: "100%",
                height: "100%",
                display: "block",
                textAlign: "left",
                px: 1.5,
                py: 1.25,
                borderRadius: 1.5,
                border: 1,
                borderColor: i === index ? "primary.main" : "divider",
                bgcolor: (t) =>
                  i === index
                    ? alpha(t.palette.primary.main, 0.08)
                    : "transparent",
                color: i === index ? "text.primary" : "text.secondary",
                fontSize: "0.84rem",
                lineHeight: 1.35,
                transition:
                  "border-color 180ms ease, background-color 180ms ease",
              }}
            >
              <Box
                component="b"
                sx={{
                  display: "block",
                  fontSize: "0.74rem",
                  color: "primary.main",
                }}
              >
                {i + 1}
              </Box>
              <Box
                component="span"
                sx={{ fontWeight: 600, color: "text.primary" }}
              >
                {termLabel(s.name)}
              </Box>
              {s.location ? `, ${s.location}` : null}
            </ButtonBase>
          </li>
        ))}
      </Box>
    </Box>
  );
}

function Timeline({
  axis: ax,
  ppp,
  windows,
  span,
}: {
  axis: Axis;
  ppp: PppBracket | null;
  windows: DetectableWindow[];
  span: DaySpan | null;
}) {
  const unit = ax.unit === "weeks" ? "Weeks" : "Days";
  return (
    <Box
      sx={{
        mt: 2.5,
        display: "grid",
        gridTemplateColumns: {
          xs: `${LABEL_COL.xs} minmax(0, 1fr)`,
          sm: `${LABEL_COL.sm} minmax(0, 1fr)`,
        },
        rowGap: 0.75,
        alignItems: "center",
      }}
    >
      <Typography
        color="text.secondary"
        sx={{ fontSize: "0.76rem", lineHeight: 1.25, pr: 1.5 }}
      >
        {unit} from infection
      </Typography>
      <Box
        sx={{
          position: "relative",
          height: 22,
          borderBottom: 1,
          borderColor: "divider",
          mr: 1.5,
        }}
      >
        {ax.ticks.map((t, i) => (
          <Typography
            key={t.day}
            component="span"
            color="text.secondary"
            sx={{
              position: "absolute",
              left: pct(t.day, ax),
              transform:
                i === 0
                  ? "none"
                  : i === ax.ticks.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
              fontSize: "0.74rem",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {t.label}
          </Typography>
        ))}
      </Box>

      {ppp ? (
        <>
          <Box />
          <Box sx={{ position: "relative", height: 30, mr: 1.5 }}>
            <Box
              sx={{
                position: "absolute",
                left: 0,
                width: pct(ppp.endDay, ax),
                top: 0,
                height: 10,
                border: "1.5px solid",
                borderTop: 0,
                borderColor: "primary.main",
                borderRadius: "0 0 3px 3px",
              }}
            />
            <Typography
              component="span"
              sx={{
                position: "absolute",
                left: 0,
                width: pct(ppp.endDay, ax),
                minWidth: "max-content",
                top: 12,
                textAlign: "center",
                fontSize: "0.74rem",
                fontWeight: 700,
                color: "primary.main",
              }}
            >
              {ppp.label}
            </Typography>
          </Box>
        </>
      ) : null}

      <Typography sx={{ fontWeight: 600, fontSize: "0.84rem", pr: 1.5 }}>
        Detectable
      </Typography>
      <Box
        sx={{
          position: "relative",
          minHeight: 30,
          mr: 1.5,
          display: "grid",
          gap: 0.5,
        }}
      >
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            inset: "-4px 0",
            transformOrigin: "left",
            transform: span
              ? `translateX(${(span.startDay / ax.endDay) * 100}%) scaleX(${
                  (span.endDay - span.startDay) / ax.endDay || 0.01
                })`
              : "none",
            opacity: span ? 1 : 0,
            bgcolor: (t) => alpha(t.palette.primary.main, 0.06),
            ...motion("transform, opacity"),
          }}
        />
        {windows.length === 0 ? (
          <Typography color="text.secondary" sx={{ fontSize: "0.8rem" }}>
            No test windows recorded
          </Typography>
        ) : (
          windows.map((w) => {
            const lit = windowLit(w, span);
            // Late windows label from their right edge so the text stays on the axis.
            const late = w.startDay / ax.endDay > 0.55;
            return (
              <Box key={w.name} sx={{ position: "relative", height: 28 }}>
                <Box
                  sx={{
                    position: "absolute",
                    left: pct(w.startDay, ax),
                    width: pct(w.endDay - w.startDay, ax),
                    top: 0,
                    bottom: 0,
                    borderRadius: 1,
                    background: (t) =>
                      `repeating-linear-gradient(135deg, ${alpha(
                        t.palette.primary.main,
                        0.24,
                      )} 0 6px, ${alpha(t.palette.primary.main, 0.08)} 6px 12px)`,
                    boxShadow: (t) =>
                      `inset 0 0 0 1.5px ${t.palette.primary.main}`,
                    opacity: lit ? 1 : 0.45,
                    ...motion("opacity"),
                  }}
                />
                <Typography
                  component="span"
                  sx={{
                    position: "absolute",
                    top: 4,
                    ...(late
                      ? { right: 0, pr: 1 }
                      : { left: pct(w.startDay, ax), pl: 1 }),
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    color: "primary.main",
                    whiteSpace: "nowrap",
                  }}
                >
                  {termLabel(w.name)}
                  {w.sample ? (
                    <Box
                      component="span"
                      sx={{
                        fontWeight: 400,
                        color: "text.secondary",
                        display: { xs: "none", sm: "inline" },
                      }}
                    >
                      {" "}
                      ({w.sample}
                      {w.openEnded ? ", onwards" : ""})
                    </Box>
                  ) : null}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}

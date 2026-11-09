import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import AtlasImage from "./AtlasImage";
import { termLabel } from "./filter";
import {
  durationLabel,
  lifecycleModel,
  stageIsDiagnostic,
  stageSpan,
  windowLit,
  type Axis,
  type DaySpan,
  type DetectableWindow,
  type HostRole,
  type PppBracket,
} from "./lifecycle";
import { isShortcutTarget } from "./keys";
import TermList from "./TermList";
import type { AtlasImageView, DatasetFields } from "./types";

type Props = {
  fields: DatasetFields;
  images?: AtlasImageView[];
  onCiteLifecycle?: () => void;
  onEditLifecycle?: () => void;
  /** Compact preview inside the stage editor (no step list / edit chrome). */
  preview?: boolean;
};

const PLAY_STEP_MS = 1200;
const MARKER_MS = 300;
const LABEL_COL = { xs: "120px", sm: "148px" };
// Phones scroll the board; room for badges on stage cards.
const STAGE_MIN_PX = { xs: 112, sm: 96 };
const LANE_PX = 88;

const laneWash = (role: HostRole | null, primary: string) => {
  if (role === "definitive") return alpha(primary, 0.12);
  if (role === "intermediate") return alpha(primary, 0.07);
  if (role === "paratenic") return alpha(primary, 0.09);
  if (role === "environment") return alpha(primary, 0.03);
  return "transparent";
};

const motion = (props: string) => ({
  transition: props
    .split(",")
    .map((p) => `${p.trim()} ${MARKER_MS}ms cubic-bezier(0.2, 0, 0, 1)`)
    .join(", "),
  "@media (prefers-reduced-motion: reduce)": { transition: "none" },
});

const pct = (day: number, ax: Axis) => `${(day / ax.endDay) * 100}%`;

export default function LifecycleBoard({
  fields,
  images = [],
  onCiteLifecycle,
  onEditLifecycle,
  preview = false,
}: Props) {
  const model = useMemo(() => lifecycleModel(fields), [fields]);
  const stages = fields.lifecycleStages;
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    setIndex((i) => Math.min(i, Math.max(0, stages.length - 1)));
  }, [stages.length]);
  const playRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
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

  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    if (!isShortcutTarget(ev)) return;
    // Not from the tab strip, and not from a modal (the rail drawer) covering the board.
    if (
      ev.target instanceof Element &&
      ev.target.closest('[role="tablist"], .MuiModal-root')
    )
      return;
    if (ev.key === "ArrowRight") step(1);
    else if (ev.key === "ArrowLeft") step(-1);
    else if (ev.key === " ") {
      // Space keeps its page-scroll meaning outside the board; a focused button clicks itself.
      if (!(ev.target instanceof Node) || !rootRef.current?.contains(ev.target))
        return;
      if (ev.target instanceof Element && ev.target.closest("button,a")) return;
      togglePlay();
    } else return;
    ev.preventDefault();
  });
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // On a phone the board scrolls sideways; keep the marker's column in view.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const track = scroller?.querySelector<HTMLElement>("[data-track]");
    if (!scroller || !track || scroller.scrollWidth <= scroller.clientWidth)
      return;
    const col = track.clientWidth / Math.max(1, stages.length);
    const label = track.offsetLeft - scroller.offsetLeft;
    const left = index * col;
    const visible = scroller.clientWidth - label;
    if (
      left >= scroller.scrollLeft &&
      left + col <= scroller.scrollLeft + visible
    )
      return;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollTo({
      left: Math.max(0, left - col),
      behavior: reduce ? "auto" : "smooth",
    });
  }, [index, stages.length]);

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

  return (
    <Box
      ref={rootRef}
      // Clicking the board focuses it, so Space plays here and still scrolls elsewhere.
      tabIndex={-1}
      sx={{ outline: "none" }}
      onPointerDownCapture={(ev) => {
        if (!playRef.current?.contains(ev.target as Node)) setPlaying(false);
      }}
    >
      <Box ref={scrollerRef} sx={{ overflowX: "auto" }}>
        {/* Flex, not grid: a sticky grid item cannot leave its own column. */}
        <Box
          sx={{
            display: "flex",
            // As wide as the board needs, so the sticky labels can travel the whole scroll.
            width: {
              xs: `max(100%, ${LABEL_COL.xs} + ${stages.length * STAGE_MIN_PX.xs}px)`,
              sm: `max(100%, ${LABEL_COL.sm} + ${stages.length * STAGE_MIN_PX.sm}px)`,
            },
          }}
        >
          <Box
            sx={{
              flex: "none",
              width: LABEL_COL,
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
                  bgcolor: (t) => laneWash(lane.role, t.palette.primary.main),
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
            data-track
            sx={{
              flex: 1,
              minWidth: 0,
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
            {lanes.map((lane, li) => (
              <Box
                key={`wash-${lane.key}`}
                aria-hidden
                sx={{
                  gridColumn: `1 / -1`,
                  gridRow: li + 1,
                  bgcolor: (t) => laneWash(lane.role, t.palette.primary.main),
                  pointerEvents: "none",
                }}
              />
            ))}
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
                zIndex: 1,
              }}
            />
            {stages.map((s, i) => {
              const diagnostic = stageIsDiagnostic(s, fields.diagnosticStage);
              return (
                <Box
                  key={`${s.name}-${i}`}
                  sx={{
                    gridColumn: i + 1,
                    gridRow: stageLane[i] + 1,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    px: 0.5,
                    py: 0.5,
                    minWidth: 0,
                    zIndex: 2,
                  }}
                >
                  <Box
                    sx={{
                      border: 1,
                      borderColor: i === index ? "primary.main" : "divider",
                      borderRadius: 1,
                      bgcolor: "background.paper",
                      px: 0.75,
                      py: 0.5,
                      minHeight: LANE_PX - 12,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      gap: 0.25,
                      position: "relative",
                    }}
                  >
                    {s.transmission ? (
                      <Typography
                        component="span"
                        sx={{
                          fontSize: "0.62rem",
                          lineHeight: 1.2,
                          color: "primary.main",
                          fontWeight: 600,
                        }}
                      >
                        ← {s.transmission}
                      </Typography>
                    ) : null}
                    <Typography
                      component="span"
                      sx={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        color: i === index ? "primary.main" : "text.secondary",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {i + 1}
                    </Typography>
                    <Typography
                      component="span"
                      sx={{
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        lineHeight: 1.15,
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
                        sx={{ fontSize: "0.68rem", lineHeight: 1.2 }}
                      >
                        {durationLabel(s.durationDays)}
                      </Typography>
                    ) : null}
                    {s.infective || diagnostic ? (
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
                        {s.infective ? (
                          <Chip
                            size="small"
                            label="Infective"
                            color="primary"
                            sx={{ height: 18, fontSize: "0.62rem" }}
                          />
                        ) : null}
                        {diagnostic ? (
                          <Chip
                            size="small"
                            label="Diagnostic"
                            variant="outlined"
                            color="primary"
                            sx={{ height: 18, fontSize: "0.62rem" }}
                          />
                        ) : null}
                      </Box>
                    ) : null}
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      </Box>

      {ax ? (
        <Timeline
          axis={ax}
          ppp={model.ppp}
          windows={model.windows}
          span={span}
          emphasizePpp={current.hostRole === "definitive"}
        />
      ) : null}

      {!preview ? (
        <SelectedStagePanel
          stage={current}
          diagnosticStage={fields.diagnosticStage}
          index={index}
          total={stages.length}
          image={
            current.imageId
              ? (images.find((img) => img.id === current.imageId) ?? null)
              : null
          }
          onCite={onCiteLifecycle}
          onEdit={onEditLifecycle}
        />
      ) : null}

      <Box
        sx={{
          mt: preview ? 1.5 : 2.5,
          pt: 2,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        {preview ? (
          <Typography
            aria-live="polite"
            color="text.secondary"
            sx={{ mb: 1.25, fontSize: "0.86rem" }}
          >
            Step {index + 1} of {stages.length}:{" "}
            <Box component="b" sx={{ color: "text.primary" }}>
              {termLabel(current.name)}
            </Box>
          </Typography>
        ) : null}
        <Box
          sx={{
            display: { xs: "grid", sm: "flex" },
            gridTemplateColumns: "1fr 1fr",
            gridTemplateAreas: '"play play" "prev next"',
            gap: 1,
            "& > :nth-of-type(1)": { gridArea: "prev" },
            "& > :nth-of-type(2)": { gridArea: "play" },
            "& > :nth-of-type(3)": { gridArea: "next" },
          }}
        >
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
        </Box>
      </Box>

      {!preview ? (
        <StepList
          stages={stages}
          index={index}
          onPick={(i) => {
            setPlaying(false);
            setIndex(i);
          }}
        />
      ) : null}
    </Box>
  );
}

function SelectedStagePanel({
  stage,
  diagnosticStage,
  index,
  total,
  image,
  onCite,
  onEdit,
}: {
  stage: DatasetFields["lifecycleStages"][number];
  diagnosticStage: string | null;
  index: number;
  total: number;
  image: AtlasImageView | null;
  onCite?: () => void;
  onEdit?: () => void;
}) {
  const diagnostic = stageIsDiagnostic(stage, diagnosticStage);
  return (
    <Box
      sx={{
        mt: 2,
        p: 1.75,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        display: "grid",
        gridTemplateColumns: image ? { xs: "1fr", sm: "1fr 112px" } : "1fr",
        gap: 1.5,
        alignItems: "start",
      }}
    >
      <Box>
        <Typography
          aria-live="polite"
          sx={{ fontSize: "0.92rem", fontWeight: 600 }}
        >
          Now, step {index + 1} of {total}: {termLabel(stage.name)}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, fontSize: "0.86rem" }}>
          {[
            stage.location,
            stage.durationDays ? durationLabel(stage.durationDays) : null,
            stage.host ? termLabel(stage.host) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Typography>
        {stage.note ? (
          <Typography sx={{ mt: 1, fontSize: "0.9rem" }}>{stage.note}</Typography>
        ) : null}
        {stage.transmission ? (
          <Typography color="text.secondary" sx={{ mt: 0.75, fontSize: "0.84rem" }}>
            Arrives via: {stage.transmission}
          </Typography>
        ) : null}
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 1 }}>
          {stage.infective ? (
            <Chip size="small" label="Infective" color="primary" />
          ) : null}
          {diagnostic ? (
            <Chip
              size="small"
              label="Diagnostic"
              variant="outlined"
              color="primary"
            />
          ) : null}
          {onCite ? (
            <Button size="small" onClick={onCite}>
              Cite
            </Button>
          ) : null}
          {onEdit ? (
            <Button size="small" variant="outlined" onClick={onEdit}>
              Edit lifecycle
            </Button>
          ) : null}
        </Box>
      </Box>
      {image ? (
        <AtlasImage image={image} ratio="1" compact sx={{ borderRadius: 1 }} />
      ) : null}
    </Box>
  );
}

function StepList({
  stages,
  index,
  onPick,
}: {
  stages: DatasetFields["lifecycleStages"];
  index: number;
  onPick: (i: number) => void;
}) {
  return (
    <Box
      component="ol"
      aria-label="Lifecycle stages"
      sx={{
        listStyle: "none",
        p: 0,
        m: 0,
        mt: 2,
        display: "grid",
        // Balanced rows: 8 stages read as 4 + 4, not 5 + 3.
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: `repeat(${Math.ceil(
            stages.length / Math.ceil(stages.length / 5),
          )}, minmax(0, 1fr))`,
        },
        gap: 1,
      }}
    >
      {stages.map((s, i) => (
        <li key={`${s.name}-${i}`}>
          <ButtonBase
            onClick={() => onPick(i)}
            aria-current={i === index ? "step" : undefined}
            sx={{
              width: "100%",
              height: "100%",
              display: "block",
              position: "relative",
              textAlign: "left",
              px: 1.5,
              py: 1.25,
              borderRadius: 1.5,
              border: 1,
              borderColor: "divider",
              color: "text.secondary",
              fontSize: "0.84rem",
              lineHeight: 1.35,
            }}
          >
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                inset: -1,
                borderRadius: 1.5,
                border: 1,
                borderColor: "primary.main",
                bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                opacity: i === index ? 1 : 0,
                transition: "opacity 180ms ease",
                pointerEvents: "none",
                "@media (prefers-reduced-motion: reduce)": {
                  transition: "none",
                },
              }}
            />
            <Box
              component="b"
              sx={{
                display: "block",
                position: "relative",
                fontSize: "0.74rem",
                color: i === index ? "primary.main" : "text.secondary",
              }}
            >
              {i + 1}
            </Box>
            <Box
              component="span"
              sx={{
                position: "relative",
                fontWeight: 600,
                color: "text.primary",
              }}
            >
              {termLabel(s.name)}
            </Box>
            {s.location ? (
              <Box component="span" sx={{ position: "relative" }}>
                , {s.location}
              </Box>
            ) : null}
          </ButtonBase>
        </li>
      ))}
    </Box>
  );
}

function spanLabel(span: DaySpan, ax: Axis): string {
  const at = (day: number) =>
    ax.unit === "weeks" ? Math.round(day / 7) : Math.round(day);
  const word = ax.unit === "weeks" ? "Week" : "Day";
  if (span.endDay >= ax.endDay) return `${word} ${at(span.startDay)} onwards`;
  return `${word}s ${at(span.startDay)} to ${at(span.endDay)}`;
}

function Timeline({
  axis: ax,
  ppp,
  windows,
  span,
  emphasizePpp = false,
}: {
  axis: Axis;
  ppp: PppBracket | null;
  windows: DetectableWindow[];
  span: DaySpan | null;
  emphasizePpp?: boolean;
}) {
  const unit = ax.unit === "weeks" ? "Weeks" : "Days";
  const rows = ["18px", "22px", ...(ppp ? ["30px"] : []), "auto"];
  return (
    <Box
      sx={{
        mt: 1.5,
        position: "relative",
        display: "grid",
        gridTemplateRows: rows.join(" "),
        gridTemplateColumns: {
          xs: `${LABEL_COL.xs} minmax(0, 1fr)`,
          sm: `${LABEL_COL.sm} minmax(0, 1fr)`,
        },
        rowGap: 0.75,
        alignItems: "center",
      }}
    >
      <Box />
      <Typography
        aria-hidden
        sx={{
          justifySelf: "end",
          mr: 1.5,
          fontSize: "0.74rem",
          fontWeight: 700,
          color: "primary.main",
          fontVariantNumeric: "tabular-nums",
          opacity: span ? 1 : 0,
          ...motion("opacity"),
        }}
      >
        {span ? spanLabel(span, ax) : "\u00a0"}
      </Typography>
      {/* Absolutely placed in the grid area, so it spans the rows without taking a cell. */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          gridColumn: 2,
          gridRow: "2 / -1",
          top: -4,
          bottom: -4,
          left: 0,
          right: 12,
          transformOrigin: "left",
          transform: span
            ? `translateX(${(span.startDay / ax.endDay) * 100}%) scaleX(${
                (span.endDay - span.startDay) / ax.endDay || 0.01
              })`
            : "none",
          opacity: span ? 1 : 0,
          bgcolor: (t) => alpha(t.palette.primary.main, 0.12),
          boxShadow: (t) =>
            `inset 1.5px 0 0 ${t.palette.primary.main}, inset -1.5px 0 0 ${t.palette.primary.main}`,
          pointerEvents: "none",
          ...motion("transform, opacity"),
        }}
      />
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
                border: emphasizePpp ? "2px solid" : "1.5px solid",
                borderTop: 0,
                borderColor: emphasizePpp ? "primary.main" : "text.primary",
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
                color: emphasizePpp ? "primary.main" : "text.primary",
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
        {windows.length === 0 ? (
          <Typography color="text.secondary" sx={{ fontSize: "0.8rem" }}>
            No test windows recorded
          </Typography>
        ) : (
          windows.map((w, wi) => {
            const lit = windowLit(w, span);
            // Late windows label from their right edge so the text stays on the axis.
            const late = w.startDay / ax.endDay > 0.55;
            return (
              <Box
                key={`${w.name}-${wi}`}
                sx={{ position: "relative", height: 28 }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    left: pct(w.startDay, ax),
                    width: pct(w.endDay - w.startDay, ax),
                    top: 0,
                    bottom: 0,
                    borderRadius: 1,
                    overflow: "hidden",
                    // currentColor follows the active scheme; theme callbacks resolve to the light palette.
                    color: "text.primary",
                    background:
                      "repeating-linear-gradient(135deg, color-mix(in srgb, currentColor 14%, transparent) 0 6px, color-mix(in srgb, currentColor 5%, transparent) 6px 12px)",
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      position: "absolute",
                      inset: 0,
                      background: (t) =>
                        `repeating-linear-gradient(135deg, ${alpha(
                          t.palette.primary.main,
                          0.28,
                        )} 0 6px, ${alpha(t.palette.primary.main, 0.1)} 6px 12px)`,
                      boxShadow: (t) =>
                        `inset 0 0 0 1.5px ${t.palette.primary.main}`,
                      borderRadius: 1,
                      opacity: lit ? 1 : 0,
                      ...motion("opacity"),
                    }}
                  />
                </Box>
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
                    color: "text.primary",
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

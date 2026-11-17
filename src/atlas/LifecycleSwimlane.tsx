import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import { termLabel } from "./filter";
import { stageSpan } from "./lifecycle";
import LifecycleStageCell, { LANE_PX } from "./LifecycleStageCell";
import TermList from "./TermList";
import type { DatasetFields } from "./types";
import {
  LABEL_COL,
  STAGE_MIN_PX,
  Timeline,
  laneWash,
  motion,
} from "./LifecycleTimeline";
import {
  useLifecycleSwimlane,
  type LifecycleSwimCtx,
} from "./useLifecycleSwimlane";

export type { LifecycleSwimCtx };

type Props = {
  fields: DatasetFields;
  /** Compact Step N of M label above the play controls (editor preview). */
  compactStepLabel?: boolean;
  afterTimeline?: (ctx: LifecycleSwimCtx) => ReactNode;
  afterControls?: (ctx: LifecycleSwimCtx) => ReactNode;
};

export default function LifecycleSwimlane({
  fields,
  compactStepLabel = false,
  afterTimeline,
  afterControls,
}: Props) {
  const {
    model,
    stages,
    index,
    playing,
    setPlaying,
    step,
    togglePlay,
    rootRef,
    playRef,
    scrollerRef,
    current,
    ctx,
    empty,
    last,
  } = useLifecycleSwimlane(fields);

  if (empty || !current || !ctx) {
    return (
      <Typography color="text.secondary">
        No lifecycle stages recorded for this parasite yet.
      </Typography>
    );
  }

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
            {stages.map((s, i) => (
              <LifecycleStageCell
                key={`${s.name}-${i}`}
                stage={s}
                index={i}
                selected={i === index}
                laneRow={stageLane[i]}
              />
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
          emphasizePpp={current.hostRole === "definitive"}
        />
      ) : null}

      {afterTimeline?.(ctx)}

      <Box
        sx={{
          mt: compactStepLabel ? 1.5 : 2.5,
          pt: 2,
          borderTop: 1,
          borderColor: "divider",
        }}
      >
        {compactStepLabel ? (
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

      {afterControls?.(ctx)}
    </Box>
  );
}

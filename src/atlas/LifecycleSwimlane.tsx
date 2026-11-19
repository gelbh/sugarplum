import { type ReactNode, type Ref } from "react";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { termLabel } from "./filter";
import LifecycleStageCell, { LANE_PX } from "./LifecycleStageCell";
import TermList from "./TermList";
import type { DatasetFields } from "./types";
import {
  LABEL_COL,
  STAGE_MIN_PX,
  Timeline,
  laneWash,
} from "./LifecycleTimeline";
import {
  useLifecycleSwimlane,
  type LifecycleSwimCtx,
} from "./useLifecycleSwimlane";

export type LifecycleDetailCtx = LifecycleSwimCtx & {
  transport: ReactNode;
};

type Props = {
  fields: DatasetFields;
  /** Compact Step N of M + transport under the board (editor preview). */
  compactStepLabel?: boolean;
  /** Stage detail under the board; owns transport. Timeline stays below. */
  afterBoard?: (ctx: LifecycleDetailCtx) => ReactNode;
};

function Transport({
  playRef,
  playing,
  index,
  last,
  onStep,
  onToggle,
}: {
  playRef: Ref<HTMLButtonElement>;
  playing: boolean;
  index: number;
  last: number;
  onStep: (delta: number) => void;
  onToggle: () => void;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
      <IconButton
        size="small"
        onClick={() => onStep(-1)}
        disabled={index === 0}
        aria-label="Previous stage"
      >
        <ChevronLeftIcon fontSize="small" />
      </IconButton>
      <IconButton
        ref={playRef}
        size="small"
        onClick={onToggle}
        aria-label={playing ? "Pause lifecycle" : "Play lifecycle"}
        aria-pressed={playing}
        color="primary"
      >
        {playing ? (
          <PauseIcon fontSize="small" />
        ) : (
          <PlayArrowIcon fontSize="small" />
        )}
      </IconButton>
      <IconButton
        size="small"
        onClick={() => onStep(1)}
        disabled={index === last}
        aria-label="Next stage"
      >
        <ChevronRightIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default function LifecycleSwimlane({
  fields,
  compactStepLabel = false,
  afterBoard,
}: Props) {
  const {
    model,
    stages,
    index,
    setIndex,
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
  const transport = (
    <Transport
      playRef={playRef}
      playing={playing}
      index={index}
      last={last}
      onStep={step}
      onToggle={togglePlay}
    />
  );
  const detailCtx: LifecycleDetailCtx = { ...ctx, transport };

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
              borderRight: 1,
              borderColor: "divider",
              boxShadow: (t) =>
                `4px 0 12px ${t.palette.mode === "dark" ? "rgba(0,0,0,0.35)" : "rgba(30,13,27,0.06)"}`,
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
                  px: 1.25,
                  borderBottom: 1,
                  borderColor: "divider",
                  bgcolor: (t) => laneWash(lane.role, t.palette.primary.main),
                  overflow: "hidden",
                }}
              >
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: "0.8rem",
                    color: "text.primary",
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {lane.title}
                </Typography>
                {lane.hosts.length > 0 ? (
                  <Typography
                    color="text.secondary"
                    sx={{
                      mt: 0.2,
                      fontSize: "0.72rem",
                      lineHeight: 1.25,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={[...lane.hosts, lane.more > 0 ? `+${lane.more}` : null]
                      .filter(Boolean)
                      .join(", ")}
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
            {stages.map((s, i) => (
              <LifecycleStageCell
                key={`${s.name}-${i}`}
                stage={s}
                index={i}
                selected={i === index}
                laneRow={stageLane[i]}
                onSelect={() => {
                  setPlaying(false);
                  setIndex(i);
                  // Cells are ButtonBase; refocus the board so Space still toggles play.
                  rootRef.current?.focus();
                }}
              />
            ))}
          </Box>
        </Box>
      </Box>

      {afterBoard ? (
        afterBoard(detailCtx)
      ) : (
        <Box
          sx={{
            mt: 1.25,
            pt: 1.25,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
            flexWrap: "wrap",
          }}
        >
          {compactStepLabel ? (
            <Typography
              aria-live="polite"
              color="text.secondary"
              sx={{ fontSize: "0.86rem" }}
            >
              Step {index + 1} of {stages.length}:{" "}
              <Box component="b" sx={{ color: "text.primary" }}>
                {termLabel(current.name)}
              </Box>
            </Typography>
          ) : (
            <Typography color="text.secondary" sx={{ fontSize: "0.82rem" }}>
              {index + 1} / {stages.length}
            </Typography>
          )}
          {transport}
        </Box>
      )}

      {ax ? (
        <Timeline axis={ax} ppp={model.ppp} windows={model.windows} />
      ) : null}
    </Box>
  );
}

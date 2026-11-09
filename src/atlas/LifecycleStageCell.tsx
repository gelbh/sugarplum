import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import { durationLabel, stageIsDiagnostic } from "./lifecycle";
import { termLabel } from "./filter";
import type { DatasetFields } from "./types";

const LANE_PX = 88;

type Stage = DatasetFields["lifecycleStages"][number];

type Props = {
  stage: Stage;
  index: number;
  selected: boolean;
  laneRow: number;
};

export { LANE_PX };

export default function LifecycleStageCell({
  stage,
  index,
  selected,
  laneRow,
}: Props) {
  const diagnostic = stageIsDiagnostic(stage);
  return (
    <Box
      sx={{
        gridColumn: index + 1,
        gridRow: laneRow + 1,
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
          borderColor: selected ? "primary.main" : "divider",
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
        {stage.transmission ? (
          <Typography
            component="span"
            sx={{
              fontSize: "0.62rem",
              lineHeight: 1.2,
              color: "primary.main",
              fontWeight: 600,
            }}
          >
            ← {stage.transmission}
          </Typography>
        ) : null}
        <Typography
          component="span"
          sx={{
            fontSize: "0.7rem",
            fontWeight: 700,
            color: selected ? "primary.main" : "text.secondary",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {index + 1}
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
          {termLabel(stage.name)}
        </Typography>
        {stage.durationDays ? (
          <Typography
            component="span"
            color="text.secondary"
            sx={{ fontSize: "0.68rem", lineHeight: 1.2 }}
          >
            {durationLabel(stage.durationDays)}
          </Typography>
        ) : null}
        {stage.infective || diagnostic ? (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
            {stage.infective ? (
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
}

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { stageIsDiagnostic } from "./lifecycle";
import { termLabel } from "../lib/labels";
import type { DatasetFields } from "../types";

const LANE_PX = 70;

type Stage = DatasetFields["lifecycleStages"][number];

type Props = {
  stage: Stage;
  index: number;
  selected: boolean;
  laneRow: number;
  onSelect: () => void;
};

export { LANE_PX };

export default function LifecycleStageCell({
  stage,
  index,
  selected,
  laneRow,
  onSelect,
}: Props) {
  const diagnostic = stageIsDiagnostic(stage);
  return (
    <Box
      sx={{
        gridColumn: index + 1,
        gridRow: laneRow + 1,
        display: "flex",
        alignItems: "center",
        px: 0.35,
        py: 0.35,
        minWidth: 0,
        zIndex: 2,
      }}
    >
      <ButtonBase
        onClick={onSelect}
        aria-current={selected ? "step" : undefined}
        sx={(t) => ({
          width: "100%",
          minHeight: LANE_PX - 14,
          maxHeight: LANE_PX - 10,
          borderRadius: 1.5,
          px: 0.9,
          py: 0.55,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          gap: 0.15,
          textAlign: "left",
          overflow: "hidden",
          bgcolor: selected
            ? alpha(t.palette.primary.main, 0.14)
            : "transparent",
          outline: selected
            ? `1px solid ${alpha(t.palette.primary.main, 0.55)}`
            : "1px solid transparent",
          "&:hover": {
            bgcolor: selected
              ? alpha(t.palette.primary.main, 0.18)
              : alpha(t.palette.primary.main, 0.06),
          },
        })}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "baseline",
            gap: 0.55,
            width: "100%",
            minWidth: 0,
          }}
        >
          <Typography
            component="span"
            sx={{
              flex: "none",
              fontSize: "0.66rem",
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
              minWidth: 0,
              fontSize: "0.82rem",
              fontWeight: selected ? 600 : 500,
              lineHeight: 1.2,
              color: "text.primary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {termLabel(stage.name)}
          </Typography>
        </Box>
        {stage.infective || diagnostic ? (
          <Box
            aria-hidden
            sx={{ display: "flex", alignItems: "center", gap: 0.45, mt: 0.1 }}
          >
            {stage.infective ? (
              <Box
                title="Infective"
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  bgcolor: "primary.main",
                }}
              />
            ) : null}
            {diagnostic ? (
              <Box
                title="Diagnostic"
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  border: 1.5,
                  borderColor: "secondary.main",
                  bgcolor: "transparent",
                }}
              />
            ) : null}
          </Box>
        ) : null}
      </ButtonBase>
    </Box>
  );
}

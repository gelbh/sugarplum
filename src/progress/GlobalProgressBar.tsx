import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { useProgressRegistry } from "./ProgressProvider";

type GlobalProgressBarProps = {
  top?: string | number;
};

/** Thin top bar for the primary active progress op (prefer job source). */
export default function GlobalProgressBar({ top = 0 }: GlobalProgressBarProps) {
  const { primary } = useProgressRegistry();

  if (!primary) return null;

  const determinate = primary.mode === "determinate";

  return (
    <Box
      sx={{
        position: "fixed",
        top,
        left: 0,
        right: 0,
        zIndex: (theme) => theme.zIndex.drawer + 1,
        pointerEvents: "none",
      }}
    >
      <LinearProgress
        variant={determinate ? "determinate" : "indeterminate"}
        value={determinate ? primary.percent : undefined}
        aria-label={primary.label}
        {...(determinate
          ? {
              "aria-valuenow": Math.round(primary.percent),
              "aria-valuemin": 0,
              "aria-valuemax": 100,
            }
          : {})}
        sx={{ height: 3 }}
      />
    </Box>
  );
}

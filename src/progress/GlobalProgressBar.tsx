import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { useProgressRegistry } from "./ProgressProvider";
import { useSpinDelay } from "./spinDelay";

const SHOW_TIMING = { delay: 200, minDuration: 300 };

type GlobalProgressBarProps = {
  top?: string | number;
};

/** Thin top bar for the primary active progress op (prefer job source). */
export default function GlobalProgressBar({ top = 0 }: GlobalProgressBarProps) {
  const { primary } = useProgressRegistry();
  const shown = useSpinDelay(primary, SHOW_TIMING);
  if (!shown) return null;

  const determinate = shown.mode === "determinate";

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
        value={determinate ? shown.percent : undefined}
        aria-label={shown.label}
        {...(determinate
          ? {
              "aria-valuenow": Math.round(shown.percent),
              "aria-valuemin": 0,
              "aria-valuemax": 100,
            }
          : {})}
        sx={{ height: 3 }}
      />
    </Box>
  );
}

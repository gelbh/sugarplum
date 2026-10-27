import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { useProgressRegistry } from "./ProgressProvider";

type GlobalProgressBarProps = {
  /** Sticky offset when a fixed top chrome sits above the page (e.g. mobile TopChrome). */
  stickyTop?: string | number;
};

/** Thin top bar for the primary active progress op (prefer job source). */
export default function GlobalProgressBar({
  stickyTop = 0,
}: GlobalProgressBarProps) {
  const { primary } = useProgressRegistry();

  if (!primary) return null;

  const determinate = primary.mode === "determinate";

  return (
    <Box
      sx={{
        position: "sticky",
        top: stickyTop,
        zIndex: 1200,
        width: "100%",
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

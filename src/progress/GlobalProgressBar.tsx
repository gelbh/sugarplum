import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { useProgressRegistry } from "./ProgressProvider";

/** Thin top bar for the primary active progress op (prefer job source). */
export default function GlobalProgressBar() {
  const { primary } = useProgressRegistry();

  if (!primary) return null;

  const determinate = primary.mode === "determinate";

  return (
    <Box
      sx={{
        position: "sticky",
        top: 0,
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

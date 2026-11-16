import type { ReactNode } from "react";
import Box from "@mui/material/Box";

type Props = {
  "aria-label": string;
  children: ReactNode;
  /** When true, board grows to fill leftover viewport under the page header band. */
  fillViewport?: boolean;
};

export default function LibraryBoard({
  "aria-label": ariaLabel,
  children,
  fillViewport = true,
}: Props) {
  return (
    <Box
      component="ul"
      role="list"
      aria-label={ariaLabel}
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        display: "grid",
        gap: "12px",
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, minmax(0, 1fr))",
          md: "repeat(3, minmax(0, 1fr))",
          lg: "repeat(4, minmax(0, 1fr))",
        },
        alignContent: "stretch",
        minHeight: fillViewport
          ? { xs: 300, sm: "min(48dvh, 420px)", md: "min(56dvh, 520px)" }
          : undefined,
        flex: fillViewport ? 1 : undefined,
        minWidth: 0,
        overflow: "auto",
      }}
    >
      {children}
    </Box>
  );
}

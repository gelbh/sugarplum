import type { ReactNode } from "react";
import Box from "@mui/material/Box";

type Props = {
  "aria-label": string;
  children: ReactNode;
};

export default function LibraryBoard({
  "aria-label": ariaLabel,
  children,
}: Props) {
  return (
    <Box
      className="board-grid"
      component="ul"
      role="list"
      aria-label={ariaLabel}
      sx={{
        listStyle: "none",
        m: 0,
        p: 0,
        display: "grid",
        gap: { xs: 1.5, sm: 2 },
        gridTemplateColumns: {
          xs: "repeat(2, minmax(0, 1fr))",
          sm: "repeat(3, minmax(0, 1fr))",
          md: "repeat(4, minmax(0, 1fr))",
        },
        alignContent: "start",
        minWidth: 0,
      }}
    >
      {children}
    </Box>
  );
}

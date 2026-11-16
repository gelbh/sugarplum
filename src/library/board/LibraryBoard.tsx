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
          xs: "repeat(auto-fit, minmax(140px, 168px))",
          sm: "repeat(auto-fit, minmax(160px, 180px))",
          md: "repeat(auto-fit, minmax(168px, 200px))",
        },
        justifyContent: "center",
        justifyItems: "stretch",
        alignContent: "center",
        flex: 1,
        width: "100%",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {children}
    </Box>
  );
}

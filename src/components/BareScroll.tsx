import type { ReactNode } from "react";
import Box from "@mui/material/Box";

type BareScrollProps = {
  children: ReactNode;
};

export default function BareScroll({ children }: BareScrollProps) {
  return (
    <Box
      sx={{
        height: "100dvh",
        maxHeight: "100dvh",
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      {children}
    </Box>
  );
}

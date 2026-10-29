import type { ReactNode } from "react";
import Box from "@mui/material/Box";

type BareScrollProps = {
  children: ReactNode;
};

/** Page scrollport for routes outside AppShell (document is overflow:hidden). */
export default function BareScroll({ children }: BareScrollProps) {
  return (
    <Box
      sx={{
        height: "100%",
        maxHeight: "100dvh",
        overflowY: "auto",
        overscrollBehavior: "contain",
      }}
    >
      {children}
    </Box>
  );
}

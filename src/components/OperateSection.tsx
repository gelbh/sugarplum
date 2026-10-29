import Paper from "@mui/material/Paper";
import type { PaperProps } from "@mui/material/Paper";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  sx?: PaperProps["sx"];
};

/** Dashboard-register outlined section paper (sugar dust page / white paper). */
export default function OperateSection({ children, sx }: Props) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5,
        bgcolor: "background.paper",
        borderColor: "divider",
        ...((sx as object) ?? {}),
      }}
    >
      {children}
    </Paper>
  );
}

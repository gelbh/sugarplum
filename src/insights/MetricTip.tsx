import Box from "@mui/material/Box";
import Tooltip from "@mui/material/Tooltip";
import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
};

/**
 * Dotted help underline for Insights jargon.
 * Hover/pointer only (no tab stop); tip text also on aria-label for AT.
 */
export default function MetricTip({ title, children }: Props) {
  return (
    <Tooltip title={title} enterDelay={280} leaveDelay={60}>
      <Box
        component="span"
        aria-label={title}
        sx={{
          cursor: "help",
          borderBottom: "1px dotted",
          borderColor: "currentColor",
        }}
      >
        {children}
      </Box>
    </Tooltip>
  );
}

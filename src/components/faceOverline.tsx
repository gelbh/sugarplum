import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { OVERLINE_SX } from "./studyFaceSx";

export function FaceOverline({
  label,
  trailing,
}: {
  label: string;
  trailing?: ReactNode;
}) {
  return (
    <Box
      sx={{
        mb: 2,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 1,
        width: "100%",
      }}
    >
      <Typography component="div" sx={OVERLINE_SX}>
        {label}
      </Typography>
      {trailing ?? null}
    </Box>
  );
}

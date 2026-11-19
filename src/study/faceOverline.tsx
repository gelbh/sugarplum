import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { ReactNode } from "react";
import { OVERLINE_SX } from "./studyFaceSx";

export function FaceOverline({
  label,
  trailing,
  dense = false,
}: {
  label: string;
  trailing?: ReactNode;
  dense?: boolean;
}) {
  return (
    <Box
      sx={{
        mb: dense ? 0.75 : 2,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: trailing ? "space-between" : "center",
        gap: 1,
        width: "100%",
      }}
    >
      <Typography
        component="div"
        sx={{
          ...OVERLINE_SX,
          ...(dense
            ? { fontSize: "0.625rem", letterSpacing: "0.18em", opacity: 0.5 }
            : null),
        }}
      >
        {label}
      </Typography>
      {trailing ?? null}
    </Box>
  );
}

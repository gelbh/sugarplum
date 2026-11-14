import type { SxProps, Theme } from "@mui/material/styles";

/** Outlined operate paper: flat sugar-dust desk; dark gets a faint ivory lift so sections read on stage. */
export const insightsPaperSx: SxProps<Theme> = (theme) => ({
  p: 2.5,
  bgcolor: "background.paper",
  borderColor: "divider",
  ...theme.applyStyles("dark", {
    bgcolor: "rgba(232, 216, 199, 0.045)",
  }),
});

/** Plum section title used across Insights papers. */
export const insightsSectionTitleSx: SxProps<Theme> = {
  color: "primary.main",
  fontWeight: 600,
  mb: 1.5,
};

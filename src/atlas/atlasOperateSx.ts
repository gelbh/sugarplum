import type { SxProps, Theme } from "@mui/material/styles";

/** Match Insights / Deck Hub Alice display. */
export const atlasBrandSerif =
  '"Alice", "Georgia", "Times New Roman", serif' as const;

/** Outlined operate desk: sugar-dust paper; dark gets a faint ivory lift. */
export const atlasOperatePaperSx: SxProps<Theme> = (theme) => ({
  p: { xs: 1.75, sm: 2.25 },
  bgcolor: "background.paper",
  borderColor: "divider",
  borderRadius: 2,
  ...theme.applyStyles("dark", {
    bgcolor: "rgba(232, 216, 199, 0.045)",
  }),
});

/** Selected-stage title: Alice as the one display moment on the board. */
export const atlasStageTitleSx: SxProps<Theme> = {
  fontFamily: atlasBrandSerif,
  color: "text.primary",
  fontWeight: 400,
  letterSpacing: "0.02em",
  fontSize: { xs: "1.2rem", sm: "1.35rem" },
  lineHeight: 1.2,
};

/** Quiet overline for axis / band chrome. */
export const atlasOverlineSx: SxProps<Theme> = {
  fontFamily: '"Source Sans 3", "Helvetica", "Arial", sans-serif',
  fontSize: "0.68rem",
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "text.secondary",
  lineHeight: 1.2,
};

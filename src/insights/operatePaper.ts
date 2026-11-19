import type { SxProps, Theme } from "@mui/material/styles";

/** Match Deck Hub / Library brand display. */
export const insightsBrandSerif =
  '"Alice", "Georgia", "Times New Roman", serif' as const;

/** Outlined operate paper: flat sugar-dust desk; dark gets a faint ivory lift. */
export const insightsPaperSx: SxProps<Theme> = (theme) => ({
  p: 2.5,
  bgcolor: "background.paper",
  borderColor: "divider",
  borderRadius: 2,
  ...theme.applyStyles("dark", {
    bgcolor: "rgba(232, 216, 199, 0.045)",
  }),
});

/** Verdict hero: plum wash field so the health check owns the desk. */
export const insightsHeroPaperSx: SxProps<Theme> = (theme) => ({
  px: { xs: 2.5, md: 3.5 },
  py: { xs: 3, md: 4 },
  borderColor: "divider",
  borderRadius: 2,
  bgcolor: "rgba(91, 44, 111, 0.06)",
  backgroundImage:
    "linear-gradient(135deg, rgba(91, 44, 111, 0.09) 0%, rgba(196, 165, 116, 0.06) 55%, rgba(91, 44, 111, 0.03) 100%)",
  ...theme.applyStyles("dark", {
    bgcolor: "rgba(206, 147, 216, 0.08)",
    backgroundImage:
      "linear-gradient(135deg, rgba(206, 147, 216, 0.12) 0%, rgba(196, 165, 116, 0.06) 55%, rgba(206, 147, 216, 0.04) 100%)",
  }),
});

/** Alice + plum chart / block titles (brand voice across Insights). */
export const insightsSectionTitleSx: SxProps<Theme> = {
  fontFamily: insightsBrandSerif,
  color: "primary.main",
  fontWeight: 400,
  letterSpacing: "0.02em",
  fontSize: "1.2rem",
  lineHeight: 1.25,
  mb: 1.25,
};

/** Quiet band label above a chart paper (Recent activity, Grades). */
export const insightsBandTitleSx: SxProps<Theme> = {
  fontFamily: insightsBrandSerif,
  color: "text.primary",
  fontWeight: 400,
  letterSpacing: "0.03em",
  fontSize: "1.35rem",
  lineHeight: 1.2,
  mb: 1.5,
};

/** Page title: Alice display like Deck Hub. */
export const insightsPageTitleSx: SxProps<Theme> = {
  m: 0,
  fontFamily: insightsBrandSerif,
  fontWeight: 400,
  letterSpacing: "0.02em",
  lineHeight: 1.1,
  color: "text.primary",
};

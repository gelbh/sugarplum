import type { SxProps, Theme } from "@mui/material/styles";

/** Quiet status rail: almost no border, soft inset wash. */
export const orchardOverviewSx: SxProps<Theme> = (theme) => ({
  px: { xs: 2, md: 2.25 },
  py: { xs: 2, md: 2.25 },
  border: "1px solid",
  borderColor: "rgba(196, 165, 116, 0.16)",
  borderRadius: 2,
  bgcolor: "transparent",
  backgroundImage:
    "linear-gradient(160deg, rgba(91, 44, 111, 0.07) 0%, rgba(196, 165, 116, 0.04) 50%, transparent 100%)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  ...theme.applyStyles("dark", {
    borderColor: "rgba(196, 165, 116, 0.2)",
    backgroundImage:
      "linear-gradient(160deg, rgba(206, 147, 216, 0.08) 0%, rgba(196, 165, 116, 0.05) 45%, rgba(0,0,0,0.12) 100%)",
    boxShadow: "inset 0 1px 0 rgba(232, 216, 199, 0.06)",
  }),
});

/** Board stage: warmer field so the podium owns the card. */
export const orchardBoardSx: SxProps<Theme> = (theme) => ({
  p: { xs: 2, md: 2.5 },
  border: "1px solid",
  borderColor: "rgba(196, 165, 116, 0.22)",
  borderRadius: 2,
  bgcolor: "background.paper",
  // Soft stop before the border so the wash does not look sliced.
  backgroundImage:
    "radial-gradient(ellipse 70% 55% at 50% 78%, rgba(196, 165, 116, 0.12) 0%, transparent 78%)",
  ...theme.applyStyles("dark", {
    bgcolor: "rgba(232, 216, 199, 0.035)",
    borderColor: "rgba(196, 165, 116, 0.28)",
    backgroundImage:
      "radial-gradient(ellipse 72% 58% at 50% 82%, rgba(226, 184, 74, 0.1) 0%, transparent 80%), linear-gradient(180deg, rgba(232, 216, 199, 0.03) 0%, transparent 55%)",
  }),
});

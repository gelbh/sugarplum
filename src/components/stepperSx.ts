import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";

/** Stepper colors from the active palette (matches headings / primary CTAs). */
export const stepperSx: SxProps<Theme> = (theme) => {
  const lightPrimary = theme.palette.primary;
  const darkPrimary =
    theme.colorSchemes?.dark?.palette?.primary ?? lightPrimary;
  const upcomingDisc = alpha(lightPrimary.main, 0.35);
  const upcomingGlyph = lightPrimary.main;
  const darkUpcomingDisc = alpha(darkPrimary.main, 0.35);
  const darkUpcomingGlyph = darkPrimary.main;

  return {
    "& .MuiStepLabel-label, & .MuiStepLabel-labelContainer, & .MuiStepLabel-label.Mui-disabled":
      {
        color: "text.secondary",
      },
    "& .MuiStepLabel-label.Mui-active, & .MuiStepLabel-label.Mui-completed": {
      color: "text.primary",
    },
    "& .MuiStepConnector-line": {
      borderColor: "divider",
    },
    // Upcoming: muted primary disc + primary numeral (same family as Library heading).
    "& .MuiStepIcon-root": {
      color: upcomingDisc,
      ...theme.applyStyles("dark", {
        color: darkUpcomingDisc,
      }),
    },
    "& .MuiStepIcon-root .MuiStepIcon-text": {
      fill: upcomingGlyph,
      ...theme.applyStyles("dark", {
        fill: darkUpcomingGlyph,
      }),
    },
    "& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed": {
      color: "primary.main",
    },
    "& .MuiStepIcon-root.Mui-active .MuiStepIcon-text, & .MuiStepIcon-root.Mui-completed .MuiStepIcon-text":
      {
        fill: lightPrimary.contrastText,
        ...theme.applyStyles("dark", {
          fill: darkPrimary.contrastText,
        }),
      },
  };
};

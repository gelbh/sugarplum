import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";

/** Stepper colors from the active palette (matches headings / primary CTAs). */
export const stepperSx: SxProps<Theme> = (theme) => {
  const upcomingDisc = alpha(theme.palette.primary.main, 0.35);
  const upcomingGlyph = theme.palette.primary.main;

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
    },
    "& .MuiStepIcon-root .MuiStepIcon-text": {
      fill: upcomingGlyph,
    },
    "& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed": {
      color: "primary.main",
    },
    "& .MuiStepIcon-root.Mui-active .MuiStepIcon-text, & .MuiStepIcon-root.Mui-completed .MuiStepIcon-text":
      {
        fill: theme.palette.primary.contrastText,
      },
  };
};

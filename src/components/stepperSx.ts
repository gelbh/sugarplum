import { alpha } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

/** Keep in sync with `theme.ts` dark.palette.primary (Theme has no colorSchemes). */
const DARK_PRIMARY = { main: "#5B2C6F", contrastText: "#e8d8c7" };

/** Stepper colors from the active palette (matches headings / primary CTAs). */
export const stepperSx = (theme: Theme) => {
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
      ...theme.applyStyles("dark", {
        color: alpha(DARK_PRIMARY.main, 0.35),
      }),
    },
    "& .MuiStepIcon-root .MuiStepIcon-text": {
      fill: upcomingGlyph,
      ...theme.applyStyles("dark", {
        fill: DARK_PRIMARY.main,
      }),
    },
    "& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed": {
      color: "primary.main",
    },
    "& .MuiStepIcon-root.Mui-active .MuiStepIcon-text, & .MuiStepIcon-root.Mui-completed .MuiStepIcon-text":
      {
        fill: theme.palette.primary.contrastText,
        ...theme.applyStyles("dark", {
          fill: DARK_PRIMARY.contrastText,
        }),
      },
  };
};

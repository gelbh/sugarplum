import type { SxProps, Theme } from "@mui/material/styles";

/** Dark-safe MUI Stepper colors (labels + icon glyphs). */
export const stepperSx: SxProps<Theme> = (theme) => ({
  "& .MuiStepLabel-label, & .MuiStepLabel-labelContainer": {
    color: "text.secondary",
  },
  "& .MuiStepLabel-label.Mui-active, & .MuiStepLabel-label.Mui-completed": {
    color: "text.primary",
  },
  "& .MuiStepLabel-label.Mui-disabled": {
    color: "text.secondary",
  },
  "& .MuiStepConnector-line": {
    borderColor: "divider",
  },
  ...theme.applyStyles("dark", {
    "& .MuiStepLabel-label, & .MuiStepLabel-labelContainer, & .MuiStepLabel-label.Mui-disabled":
      {
        color: "rgba(255, 255, 255, 0.72)",
      },
    "& .MuiStepLabel-label.Mui-active, & .MuiStepLabel-label.Mui-completed": {
      color: "#F5F5F5",
    },
    // Upcoming: dark disc + white numeral (not black-on-black / white-on-light).
    "& .MuiStepIcon-root": {
      color: "#616161",
    },
    "& .MuiStepIcon-root .MuiStepIcon-text": {
      fill: "#FFFFFF",
    },
    "& .MuiStepIcon-root.Mui-active, & .MuiStepIcon-root.Mui-completed": {
      color: theme.palette.primary.main,
    },
    "& .MuiStepIcon-root.Mui-active .MuiStepIcon-text, & .MuiStepIcon-root.Mui-completed .MuiStepIcon-text":
      {
        fill: "#1A1A1A",
      },
  }),
});

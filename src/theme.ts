import { createTheme } from "@mui/material/styles";
import { stepIconClasses } from "@mui/material/StepIcon";
import { stepLabelClasses } from "@mui/material/StepLabel";

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "data",
  },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#5B2C6F" },
        secondary: { main: "#1ABC9C" },
      },
    },
    dark: {
      palette: {
        // Mid purple so contrastText stays light; avoid light-lavender + black glyphs.
        primary: { main: "#CE93D8", contrastText: "#1A1A1A" },
        secondary: { main: "#4ECDC4", contrastText: "#1A1A1A" },
        text: {
          primary: "#F5F5F5",
          secondary: "rgba(255, 255, 255, 0.78)",
          disabled: "rgba(255, 255, 255, 0.55)",
        },
        action: {
          disabled: "rgba(255, 255, 255, 0.45)",
          disabledBackground: "rgba(255, 255, 255, 0.12)",
        },
        divider: "rgba(255, 255, 255, 0.18)",
      },
    },
  },
  typography: { fontFamily: '"Roboto", "Helvetica", "Arial", "sans-serif"' },
  components: {
    MuiStepIcon: {
      styleOverrides: {
        root: ({ theme: t }) =>
          t.applyStyles("dark", {
            // Upcoming steps: readable grey disc (not near-black).
            color: t.palette.grey[500],
            [`&.${stepIconClasses.active}, &.${stepIconClasses.completed}`]: {
              color: t.palette.primary.main,
            },
            // Numbers on upcoming discs must not use primary.contrastText (black).
            [`&:not(.${stepIconClasses.active}):not(.${stepIconClasses.completed}) .${stepIconClasses.text}`]:
              {
                fill: t.palette.common.white,
              },
          }),
        text: ({ theme: t }) =>
          t.applyStyles("dark", {
            fill: t.palette.primary.contrastText,
          }),
      },
    },
    MuiStepLabel: {
      styleOverrides: {
        label: ({ theme: t }) =>
          t.applyStyles("dark", {
            color: t.palette.text.secondary,
            [`&.${stepLabelClasses.active}, &.${stepLabelClasses.completed}`]: {
              color: t.palette.text.primary,
            },
            [`&.${stepLabelClasses.disabled}`]: {
              color: t.palette.text.secondary,
            },
          }),
        labelContainer: ({ theme: t }) =>
          t.applyStyles("dark", {
            color: t.palette.text.secondary,
          }),
      },
    },
  },
});

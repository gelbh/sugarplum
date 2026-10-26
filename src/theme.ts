import { createTheme } from "@mui/material/styles";

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
        // Lighter brand accents so text/links clear WCAG on near-black surfaces.
        primary: { main: "#CE93D8" },
        secondary: { main: "#4ECDC4" },
        text: {
          primary: "#F5F5F5",
          secondary: "rgba(255, 255, 255, 0.78)",
          disabled: "rgba(255, 255, 255, 0.5)",
        },
        action: {
          disabled: "rgba(255, 255, 255, 0.38)",
          disabledBackground: "rgba(255, 255, 255, 0.12)",
        },
        divider: "rgba(255, 255, 255, 0.18)",
      },
    },
  },
  typography: { fontFamily: '"Roboto", "Helvetica", "Arial", "sans-serif"' },
  components: {
    MuiStepLabel: {
      styleOverrides: {
        label: ({ theme: t }) =>
          t.applyStyles("dark", {
            "&.Mui-disabled": {
              color: t.palette.text.secondary,
            },
          }),
      },
    },
  },
});

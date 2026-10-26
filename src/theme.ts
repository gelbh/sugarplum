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
        primary: { main: "#CE93D8", contrastText: "#121212" },
        secondary: { main: "#4ECDC4", contrastText: "#121212" },
        text: {
          primary: "#F5F5F5",
          secondary: "rgba(255, 255, 255, 0.75)",
          disabled: "rgba(255, 255, 255, 0.5)",
        },
        action: {
          active: "#fff",
          disabled: "rgba(255, 255, 255, 0.4)",
          disabledBackground: "rgba(255, 255, 255, 0.12)",
        },
        divider: "rgba(255, 255, 255, 0.16)",
      },
    },
  },
  typography: { fontFamily: '"Roboto", "Helvetica", "Arial", "sans-serif"' },
});

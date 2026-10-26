import { createTheme } from "@mui/material/styles";

const brand = {
  primary: { main: "#5B2C6F" },
  secondary: { main: "#1ABC9C" },
};

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "data",
  },
  colorSchemes: {
    light: {
      palette: {
        ...brand,
      },
    },
    dark: {
      palette: {
        ...brand,
      },
    },
  },
  typography: { fontFamily: '"Roboto", "Helvetica", "Arial", "sans-serif"' },
});

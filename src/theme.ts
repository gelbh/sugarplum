import { createTheme } from "@mui/material/styles";

/** Sugarplum brand: fruit plum for light surfaces / filled CTAs. */
const PLUM = "#5B2C6F";
/** Muted candied amber/gold; secondary only. */
const AMBER = "#C4A574";
/** Plum ink for Operate copy (sugar-dust register). */
const PLUM_INK = "#1e0d1b";
/** Sugar-dust Operate ground (Dual Register; stage lives in brand.css / shell). */
const SUGAR_DUST = "#F5F5F5";

const sans = '"Source Sans 3", "Helvetica", "Arial", sans-serif';
const brandSerif = '"Alice", "Georgia", "Times New Roman", serif';

export const theme = createTheme({
  cssVariables: {
    colorSchemeSelector: "data",
  },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: PLUM, contrastText: "#FFFFFF" },
        secondary: { main: AMBER, contrastText: PLUM_INK },
        background: {
          default: SUGAR_DUST,
          paper: "#FFFFFF",
        },
        text: {
          primary: PLUM_INK,
          secondary: "rgba(30, 13, 27, 0.72)",
          disabled: "rgba(30, 13, 27, 0.4)",
        },
        divider: "rgba(30, 13, 27, 0.12)",
      },
    },
    dark: {
      // Dual Register: Operate stays sugar-dust; night stage is `.sp-stage` / shell only.
      palette: {
        primary: { main: PLUM, contrastText: "#FFFFFF" },
        secondary: { main: AMBER, contrastText: PLUM_INK },
        background: {
          default: SUGAR_DUST,
          paper: "#FFFFFF",
        },
        text: {
          primary: PLUM_INK,
          secondary: "rgba(30, 13, 27, 0.72)",
          disabled: "rgba(30, 13, 27, 0.4)",
        },
        divider: "rgba(30, 13, 27, 0.12)",
      },
    },
  },
  typography: {
    fontFamily: sans,
    h6: { fontFamily: brandSerif },
  },
});

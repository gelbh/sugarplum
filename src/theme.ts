import { createTheme } from "@mui/material/styles";

/** Sugarplum brand: fruit plum accent shared by both Operate registers. */
const PLUM = "#5B2C6F";
/** Muted candied amber/gold; secondary only. */
const AMBER = "#C4A574";
/** Evening desk stage (zen). */
const STAGE = "#1e0d1b";
const STAGE_DEEP = "#180816";
/** Fruit-flesh ivory (study card face via brand.css; not global paper). */
const IVORY = "#e8d8c7";
/** Plum ink for light dashboard copy. */
const PLUM_INK = "#1e0d1b";
/** Sugar-dust dashboard ground. */
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
      palette: {
        primary: { main: PLUM, contrastText: IVORY },
        secondary: { main: AMBER, contrastText: STAGE_DEEP },
        background: {
          default: STAGE,
          paper: STAGE_DEEP,
        },
        text: {
          primary: "#F5F5F5",
          secondary: "rgba(232, 216, 199, 0.78)",
          disabled: "rgba(232, 216, 199, 0.45)",
        },
        action: {
          active: IVORY,
          disabled: "rgba(232, 216, 199, 0.4)",
          disabledBackground: "rgba(232, 216, 199, 0.12)",
        },
        divider: "rgba(232, 216, 199, 0.16)",
      },
    },
  },
  typography: {
    fontFamily: sans,
    h6: { fontFamily: brandSerif },
  },
});

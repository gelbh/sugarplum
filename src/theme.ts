import { createTheme } from "@mui/material/styles";

const PLUM = "#5B2C6F";
const PLUM_ON_DARK = "#CE93D8";
const AMBER = "#C4A574";
const STAGE = "#1e0d1b";
const STAGE_DEEP = "#180816";
const IVORY = "#e8d8c7";
const PLUM_INK = "#1e0d1b";
const SUGAR_DUST = "#F5F5F5";
const PLUM_WASH = "rgba(91, 44, 111, 0.12)";
const PLUM_WASH_HOVER = "rgba(91, 44, 111, 0.18)";
const PLUM_WASH_DARK = "rgba(206, 147, 216, 0.16)";
const PLUM_WASH_DARK_HOVER = "rgba(206, 147, 216, 0.24)";

const sans = '"Source Sans 3", "Helvetica", "Arial", sans-serif';
const brandSerif = '"Alice", "Georgia", "Times New Roman", serif';

const popupPaper = {
  borderRadius: 6,
  backgroundImage: "none",
  border: "1px solid",
  borderColor: "divider",
} as const;

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
        primary: { main: PLUM_ON_DARK, contrastText: STAGE_DEEP },
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
  components: {
    MuiMenu: {
      defaultProps: {
        slotProps: {
          paper: { elevation: 8 },
        },
      },
      styleOverrides: {
        paper: {
          ...popupPaper,
        },
      },
    },
    MuiAutocomplete: {
      defaultProps: {
        slotProps: {
          paper: { elevation: 8 },
        },
      },
      styleOverrides: {
        paper: {
          ...popupPaper,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme: t }) => ({
          borderRadius: 4,
          minHeight: 40,
          "& .MuiListItemIcon-root": {
            minWidth: 36,
            color: "inherit",
          },
          "&.Mui-selected": {
            backgroundColor: PLUM_WASH,
            ...t.applyStyles("dark", {
              backgroundColor: PLUM_WASH_DARK,
            }),
          },
          "&.Mui-selected:hover": {
            backgroundColor: PLUM_WASH_HOVER,
            ...t.applyStyles("dark", {
              backgroundColor: PLUM_WASH_DARK_HOVER,
            }),
          },
        }),
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          display: "flex",
          alignItems: "center",
        },
      },
    },
  },
});

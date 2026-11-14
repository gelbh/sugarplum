import { useColorScheme, useTheme } from "@mui/material/styles";

/** Keep in sync with `theme.ts` light/dark primary + neutrals (SVG cannot use cssVars channels). */
const LIGHT = {
  primary: "#5B2C6F",
  textPrimary: "#1e0d1b",
  textSecondary: "rgba(30, 13, 27, 0.72)",
  divider: "rgba(30, 13, 27, 0.12)",
  paper: "#FFFFFF",
  hover: "rgba(30, 13, 27, 0.04)",
} as const;

const DARK = {
  primary: "#CE93D8",
  textPrimary: "#F5F5F5",
  textSecondary: "rgba(232, 216, 199, 0.78)",
  divider: "rgba(232, 216, 199, 0.16)",
  paper: "#180816",
  hover: "rgba(232, 216, 199, 0.08)",
} as const;

export type ChartColorSet = {
  primary: string;
  textPrimary: string;
  textSecondary: string;
  divider: string;
  paper: string;
  hover: string;
};

/** Active color-scheme paints for Recharts / SVG (cssVariables `theme.palette` stays light). */
export function useChartColors(): ChartColorSet {
  const theme = useTheme();
  const { mode, systemMode } = useColorScheme();
  const resolved =
    mode === "system" ? systemMode : mode ?? theme.palette.mode;
  return resolved === "dark" ? DARK : LIGHT;
}

export function heatmapFills(primary: string): readonly string[] {
  // Relative opacity ladder on the active primary (readable on sugar dust and stage).
  if (primary === DARK.primary) {
    return [
      "rgba(206, 147, 216, 0.14)",
      "rgba(206, 147, 216, 0.32)",
      "rgba(206, 147, 216, 0.52)",
      "rgba(206, 147, 216, 0.75)",
      DARK.primary,
    ];
  }
  return [
    "rgba(91, 44, 111, 0.14)",
    "rgba(91, 44, 111, 0.32)",
    "rgba(91, 44, 111, 0.52)",
    "rgba(91, 44, 111, 0.75)",
    LIGHT.primary,
  ];
}

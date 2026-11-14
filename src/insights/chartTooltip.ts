import type { ChartColorSet } from "./chartColors";

/** Flat operate tooltip chrome for Recharts (no drop shadow costume). */
export function chartTooltipStyles(colors: ChartColorSet) {
  return {
    contentStyle: {
      backgroundColor: colors.paper,
      border: `1px solid ${colors.divider}`,
      borderRadius: 6,
      fontSize: 12,
      lineHeight: 1.4,
      padding: "8px 12px",
      boxShadow: "none",
    },
    labelStyle: {
      color: colors.textPrimary,
      fontWeight: 600,
      marginBottom: 4,
    },
    itemStyle: {
      color: colors.textSecondary,
      padding: 0,
    },
    cursor: { fill: colors.hover },
  } as const;
}

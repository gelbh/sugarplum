import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import MetricTip from "./MetricTip";
import { insightsBrandSerif } from "./operatePaper";

type Props = {
  value: string | number;
  label: string;
  tip?: string;
  accent?: "primary" | "warning";
  /** Chart KPI row uses md; hero strip uses sm. */
  size?: "md" | "sm";
};

/** Shared Alice value + tipped caption used across Insights KPI rows. */
export default function InsightsAliceStat({
  value,
  label,
  tip,
  accent = "primary",
  size = "md",
}: Props) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline">
      <Typography
        component="span"
        sx={{
          fontFamily: insightsBrandSerif,
          fontWeight: 400,
          fontSize: size === "sm" ? "1.05rem" : "1.35rem",
          lineHeight: size === "sm" ? 1.2 : 1,
          fontVariantNumeric: "tabular-nums",
          color: accent === "warning" ? "warning.main" : "primary.main",
        }}
      >
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {tip ? <MetricTip title={tip}>{label}</MetricTip> : label}
      </Typography>
    </Stack>
  );
}

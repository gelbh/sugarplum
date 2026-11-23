import Alert from "@mui/material/Alert";

type Props = {
  percent?: number | null;
};

/** Non-blocking signal while soft-complete gap-fill still runs. */
export default function EnrichmentBanner({ percent }: Props) {
  const pct =
    typeof percent === "number" && Number.isFinite(percent)
      ? ` ${Math.round(Math.min(100, Math.max(0, percent)))}%`
      : "";
  return (
    <Alert severity="info" sx={{ flexShrink: 0 }}>
      {`Filling coverage gaps…${pct}`}
    </Alert>
  );
}

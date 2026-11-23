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
      {`Drafts are ready to review while coverage gaps fill${pct}. Free-path quality is best-effort; edit or regen weak cards.`}
    </Alert>
  );
}

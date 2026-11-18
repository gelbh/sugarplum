import Typography from "@mui/material/Typography";

type Props = {
  label: string;
  tone?: "primary" | "error" | "warning";
};

/** Uppercase dialog title eyebrow. */
export default function DialogEyebrow({ label, tone = "primary" }: Props) {
  return (
    <Typography
      component="p"
      sx={{
        m: 0,
        mb: 0.75,
        fontSize: "0.6875rem",
        fontWeight: 500,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color: `${tone}.main`,
      }}
    >
      {label}
    </Typography>
  );
}
